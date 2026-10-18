import {beforeAll,beforeEach,afterAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {getPool,closeDatabase} from '../src/db';
import {executeAction,readState,restoreState,seedDemo} from '../src/server/service';
import {allocate,bankroll} from '../src/domain/calculations';
import type {AuditEntry,ImportBatch,Pick,Quote,Strategy,Ticket,Tipster} from '../src/domain/types';
import { ANALYSIS_DEMO_VERSION } from '../src/server/demo-analysis';
import type {ImportPreview} from '../src/server/imports';

const iso=(hours:number)=>new Date(Date.now()+hours*3600000).toISOString();
async function act<T>(action:string,payload:unknown):Promise<T>{return await executeAction('personal',action,payload) as T;}
const initial=()=>act('ledger.add',{kind:'initial',amountCents:10000,at:iso(-240),description:'Solde initial documenté'});
const tipster=()=>act<Tipster>('tipster.save',{name:'Tipster de test',source:'Test'});
const ticketData=()=>({event:'Lyon — Paris',selection:'Lyon',market:'Vainqueur',odds:1.8,stakeCents:1000,sourceId:'actual-1',source:'Relevé du ticket réel',placedAt:iso(-3)});
const importPayload=(kind:'picks'|'tickets',csv:string,extra:Record<string,unknown>={})=>({kind,csv,fileName:'test.csv',mapping:{},rightsConfirmed:true,...extra});
const openCsv=()=>`source_id;event;selection;market;odds;stake;placed_at;result;return;settled_at\nticket-1;Lyon — Paris;Lyon;Vainqueur;1,80;10,00;${iso(-3)};open;0;`;

async function clearTestDatabase(){
  // Refuse any destructive fixture cleanup outside the explicitly named test database.
  if(new URL(process.env.DATABASE_URL??'').pathname!=='/prisme_test')throw new Error('Les tests d’intégration exigent la base dédiée prisme_test.');
  await getPool().query('TRUNCATE audit,imports,simulations,ledger,quotes,tickets,picks,strategies,tipsters,settings CASCADE');
}
beforeAll(async()=>{if(new URL(process.env.DATABASE_URL??'').pathname!=='/prisme_test')throw new Error('Base de test dédiée requise.');await getPool().query(await readFile('migrations/0001_initial.sql','utf8'));});
beforeEach(clearTestDatabase);
afterAll(closeDatabase);

describe('service transactionnel PostgreSQL',()=>{
  it('isole la démonstration, conserve le personnel vide et rend le seed idempotent',async()=>{
    const first=await seedDemo();const second=await seedDemo();const personal=await readState('personal');
    expect(first.picks.length).toBeGreaterThan(85);expect(second.picks).toHaveLength(first.picks.length);expect(second.ledger.length).toBe(first.ledger.length);expect(personal.picks).toHaveLength(0);expect(personal.ledger).toHaveLength(0);
    expect(second.audit.filter(entry => entry.action === ANALYSIS_DEMO_VERSION)).toHaveLength(1);
    await expect(executeAction('personal','demo.seed',{})).rejects.toThrow('isolée');
    await expect(act('pick.save',{tipsterId:first.tipsters[0].id,event:'Test',market:'V',selection:'A',odds:2,publishedAt:iso(-1),startsAt:iso(2)})).rejects.toThrow('dans cet espace');
  });
  it('horodate les observations serveur, conserve le contenu initial et trace les corrections',async()=>{
    const t=await tipster();const p=await act<Pick>('pick.save',{tipsterId:t.id,event:'Test',market:'Vainqueur',selection:'A',odds:2,publishedAt:iso(-1),startsAt:iso(2),observedAt:'1999-01-01',evidence:'observed'});
    expect(p.evidence).toBe('observed');expect(Date.parse(p.observedAt)).toBeGreaterThan(Date.now()-10000);
    const edited=await act<Pick>('pick.save',{id:p.id,odds:2.1,initialContent:'Falsifié'});
    expect(edited.initialContent).toBe(p.initialContent);expect(edited.evidence).toBe('declared');expect(edited.revisions).toHaveLength(1);expect(edited.revisions[0].previous.odds).toBe(2);
    const retrospective=await act<Pick>('pick.save',{tipsterId:t.id,event:'Passé',market:'Vainqueur',selection:'B',odds:2,publishedAt:iso(-3),startsAt:iso(-2),evidence:'observed'});expect(retrospective.evidence).toBe('declared');
  });
  it('ne débite une mise qu’une fois et applique les retours par delta de révision',async()=>{
    await initial();const t=await act<Ticket>('ticket.save',ticketData());expect(bankroll(await readState('personal')).cashCents).toBe(9000);
    const settled=await act<Ticket>('ticket.save',{id:t.id,result:'won',returnCents:1800,settledAt:iso(-1)});expect(settled.id).toBe(t.id);
    const repeated=await act<Ticket>('ticket.save',{id:t.id,result:'won',returnCents:1800,settledAt:settled.settledAt});
    let state=await readState('personal');expect(state.tickets).toHaveLength(1);expect(state.ledger.filter(l=>l.kind==='ticket_stake')).toHaveLength(1);expect(state.ledger.filter(l=>l.kind==='ticket_return')).toHaveLength(1);expect(bankroll(state).cashCents).toBe(10800);expect(repeated.revisions).toHaveLength(1);
    await act('ticket.save',{id:t.id,returnCents:1700});state=await readState('personal');expect(bankroll(state).cashCents).toBe(10700);expect(state.ledger.find(l=>l.kind==='ticket_return'&&l.amountCents===-100)).toBeDefined();
  });
  it('importe ouvert puis réglé sous le même ID, déduplique le fichier et préserve les corrections manuelles',async()=>{
    await initial();const csv=openCsv();const first=await act<ImportBatch>('import.commit',importPayload('tickets',csv));expect(first.created).toBe(1);
    const duplicate=await act<ImportBatch>('import.commit',importPayload('tickets',csv));expect(duplicate.created).toBe(0);expect(duplicate.skipped).toBe(1);
    const settledCsv=csv.replace(';open;0;',`;won;18;${iso(-1)}`);const update=await act<ImportBatch>('import.commit',importPayload('tickets',settledCsv));expect(update.updated).toBe(1);
    let state=await readState('personal');expect(state.tickets).toHaveLength(1);expect(bankroll(state).cashCents).toBe(10800);expect(state.ledger.filter(l=>l.kind==='ticket_stake')).toHaveLength(1);
    expect(bankroll(state).drawdownPct).toBe(0);expect(state.ledger.find(l=>l.kind==='ticket_return')?.at).toBe(state.tickets[0].settledAt);
    await act('ticket.save',{id:state.tickets[0].id,returnCents:1750,notes:'Correction de justificatif'});
    const preserved=await act<ImportBatch>('import.commit',importPayload('tickets',settledCsv.replace(';won;18;',';won;19;')));expect(preserved.skipped).toBe(1);state=await readState('personal');expect(state.tickets[0].returnCents).toBe(1750);
  });
  it('présente les mêmes erreurs financières avant import et annule toute mutation sans confirmation partielle',async()=>{
    const preview=await act<ImportPreview>('import.preview',importPayload('tickets',openCsv()));expect(preview.rows[0].errors.join()).toContain('insuffisant');
    await expect(act('import.commit',importPayload('tickets',openCsv()))).rejects.toThrow('invalide');expect((await readState('personal')).tickets).toHaveLength(0);
    await initial();const csv=`source_id;event;selection;market;odds;stake;placed_at\na;A;A;Vainqueur;2;10;${iso(-2)}\nb;B;B;Vainqueur;0;10;${iso(-2)}`;
    await expect(act('import.commit',importPayload('tickets',csv))).rejects.toThrow('invalide');expect((await readState('personal')).tickets).toHaveLength(0);
    const partial=await act<ImportBatch>('import.commit',importPayload('tickets',csv,{allowPartial:true}));expect(partial.created).toBe(1);expect(partial.errors).toHaveLength(1);expect(bankroll(await readState('personal')).cashCents).toBe(9000);
  });
  it('requiert des droits d’usage et une décision explicite pour les doublons sans identifiant',async()=>{
    await initial();const csv=openCsv().replace('ticket-1;',';');await expect(act('import.commit',importPayload('tickets',csv,{rightsConfirmed:false}))).rejects.toThrow('droit');
    await act('import.commit',importPayload('tickets',csv));const changed=csv+'\n';const preview=await act<ImportPreview>('import.preview',importPayload('tickets',changed));expect(preview.rows[0].warnings.join()).toContain('Doublon probable');
    await expect(act('import.commit',importPayload('tickets',changed))).rejects.toThrow('confirmation');await act('import.commit',importPayload('tickets',changed,{allowProbableDuplicates:true}));expect((await readState('personal')).tickets).toHaveLength(2);
  });
  it('interprète les centimes français et dates Paris, sans transformer un historique CSV en observation',async()=>{
    const csv='source_id;tipster;event;market;selection;odds;published_at;starts_at\np-1;Nouveau;A — B;Vainqueur;A;1,90;10/01/2026 12:00;10/01/2026 18:00';
    const batch=await act<ImportBatch>('import.commit',importPayload('picks',csv));expect(batch.created).toBe(1);const state=await readState('personal');expect(state.tipsters).toHaveLength(1);expect(state.picks[0].publishedAt).toBe('2026-01-10T11:00:00.000Z');expect(state.picks[0].evidence).toBe('declared');expect(state.picks[0].odds).toBe(1.9);
    const duplicateId=csv.replace('Nouveau;','Autre;');await act('import.commit',importPayload('picks',duplicateId));expect((await readState('personal')).picks).toHaveLength(2);
  });
  it('conserve le cashout partiel ouvert et bloque une allocation lorsque le coût restant est inconnu',async()=>{
    await initial();const t=await act<Ticket>('ticket.save',{...ticketData(),result:'cashout',returnCents:400,settledAt:iso(-1),partialCashout:true,remainingStakeCents:null});
    let state=await readState('personal');expect(bankroll(state).uncertainOpenCost).toBe(true);expect(bankroll(state).cashCents).toBe(9400);
    const tip=await tipster();const p=await act<Pick>('pick.save',{tipsterId:tip.id,event:'Autre',market:'Vainqueur',selection:'A',odds:2,publishedAt:iso(-1),startsAt:iso(2)});await act<Quote>('quote.save',{pickId:p.id,odds:2,matchConfirmed:true,available:true,source:'Observation manuelle',observedAt:iso(0)});
    state=await readState('personal');expect(allocate(state,[{pickId:p.id,probability:null,probabilitySource:null}],'fixed')[0].stakeCents).toBe(0);
    await act('ticket.save',{id:t.id,remainingStakeCents:500});expect(bankroll(await readState('personal')).openStakeCents).toBe(500);
  });
  it('sérialise les mises concurrentes et refuse le cash négatif',async()=>{
    await act('ledger.add',{kind:'initial',amountCents:1000,description:'Initial'});
    const results=await Promise.allSettled([act('ticket.save',{...ticketData(),sourceId:'one',stakeCents:700}),act('ticket.save',{...ticketData(),sourceId:'two',stakeCents:700})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(bankroll(await readState('personal')).cashCents).toBe(300);
    await expect(act('ledger.add',{kind:'withdrawal',amountCents:100,description:'Retrait'})).rejects.toThrow('négatif');
  });
  it('fige les versions de stratégie et recalcule les simulations sans écrire de cash',async()=>{
    await initial();const strategy=await act<Strategy>('strategy.save',{name:'Test',filter:{sport:'Football'},discoveryEnd:iso(-48),validationStart:iso(1)});const next=await act<Strategy>('strategy.save',{id:strategy.id,name:'Test v2',filter:{sport:'Football',oddsMin:1.8}});expect(next.id).not.toBe(strategy.id);
    const before=await readState('personal');await act('simulation.save',{name:'Simulation vide',method:'fixed',strategyId:next.id,candidates:[],allocations:[{stakeCents:999999}]});const state=await readState('personal');expect(state.strategies).toHaveLength(2);expect(state.strategies.find(s=>s.id===strategy.id)?.filter).toEqual({sport:'Football'});expect(state.simulations[0].allocations).toEqual([]);expect(state.ledger).toEqual(before.ledger);
  });
  it('restaure les centimes et liens cohérents dans un espace vide uniquement',async()=>{
    await initial();await act('ticket.save',ticketData());const snapshot=await readState('personal');await expect(restoreState(snapshot)).rejects.toThrow('espace vide');await clearTestDatabase();await restoreState(snapshot);const restored=await readState('personal');expect(restored.tickets).toEqual(snapshot.tickets);expect(restored.ledger).toEqual(snapshot.ledger);expect(restored.audit.some(a=>a.action==='backup.restore')).toBe(true);
  });
  it('refuse une sauvegarde dont les écritures ne correspondent plus aux tickets',async()=>{
    await initial();await act('ticket.save',ticketData());const snapshot=await readState('personal');snapshot.ledger=snapshot.ledger.filter(e=>e.kind!=='ticket_stake');await clearTestDatabase();await expect(restoreState(snapshot)).rejects.toThrow('incohérente');expect((await readState('personal')).ledger).toHaveLength(0);
  });
  it('vérifie l’identité d’un ticket lié et invalide les anciennes cotes après révision du marché',async()=>{
    await initial();const t=await tipster();const pick=await act<Pick>('pick.save',{tipsterId:t.id,event:'Match test',market:'Vainqueur',selection:'A',rules:'Temps réglementaire',odds:2,publishedAt:iso(-1),startsAt:iso(3)});
    await act('quote.save',{pickId:pick.id,odds:2,source:'Observation manuelle',matchConfirmed:true});
    await expect(act('ticket.save',{...ticketData(),pickId:pick.id,event:pick.event,selection:'B',rules:pick.rules})).rejects.toThrow('ne correspond');expect(bankroll(await readState('personal')).cashCents).toBe(10000);
    await act('pick.save',{id:pick.id,selection:'B'});const state=await readState('personal');expect(state.quotes).toHaveLength(2);expect(state.quotes.some(q=>q.source.includes('révision')&&!q.matchConfirmed)).toBe(true);
  });
  it('réserve les probabilités de simulation aux hypothèses manuelles dans cette version',async()=>{
    const t=await tipster();const pick=await act<Pick>('pick.save',{tipsterId:t.id,event:'Test de provenance',market:'Vainqueur',selection:'A',odds:2,publishedAt:iso(-1),startsAt:iso(3)});
    for(const probabilitySource of ['market','model'])await expect(act('simulation.save',{name:'Provenance non évaluée',method:'kelly',candidates:[{pickId:pick.id,probability:0.6,probabilitySource}]})).rejects.toThrow('hypothèse manuelle');
    expect((await readState('personal')).simulations).toHaveLength(0);
    await act('simulation.save',{name:'Hypothèse déclarée',method:'kelly',candidates:[{pickId:pick.id,probability:0.6,probabilitySource:'manual'}]});expect((await readState('personal')).simulations).toHaveLength(1);
  });
  it('documente les probabilités de référence et refuse les cotes de clôture tardives',async()=>{
    const t=await tipster();const pick=await act<Pick>('pick.save',{tipsterId:t.id,event:'Test de clôture',market:'Vainqueur',selection:'A',odds:2,publishedAt:iso(-4),startsAt:iso(-2)});
    const quote={pickId:pick.id,odds:2,source:'Relevé personnel complet',matchConfirmed:true,observedAt:iso(-3)};
    await expect(act('quote.save',{...quote,referenceProbability:0.5,notes:'  '})).rejects.toThrow('marché complet');
    await expect(act('quote.save',{...quote,closing:true,observedAt:iso(-1)})).rejects.toThrow('au plus tard');
    const notes=`Marché complet à deux issues A/B : 1,90 / 1,90 ; normalisation proportionnelle ; source relevé personnel du ${quote.observedAt}.`;
    const accepted=await act<Quote>('quote.save',{...quote,closing:true,referenceProbability:0.5,notes});expect(accepted.referenceProbability).toBe(0.5);expect(accepted.notes).toBe(notes);expect((await readState('personal')).quotes).toHaveLength(1);
  });
  it('refuse un résultat prématuré et conserve l’exception du cashout documenté',async()=>{
    const t=await tipster();const data={tipsterId:t.id,event:'Règlement avant début',market:'Vainqueur',selection:'A',odds:2,publishedAt:iso(-4),startsAt:iso(-1),settledAt:iso(-2),settlementSource:'Justificatif déclaré'};
    for(const result of ['won','lost','void'])await expect(act('pick.save',{...data,result})).rejects.toThrow('début de l’événement');
    const cashout=await act<Pick>('pick.save',{...data,result:'cashout'});expect(cashout.result).toBe('cashout');expect((await readState('personal')).picks).toHaveLength(1);
  });
  it('consigne chaque variante explorée sans effacer les hypothèses antérieures et valide son contexte', async () => {
    const profile = await tipster();
    const payload = { name: 'Basket live à observer', proof: 'declared', filter: { tipsterId: profile.id, sport: 'Basketball', timing: 'live', delayMinMinutes: -30, delayMaxMinutes: 0 }, axis: 'delay', phase: 'discovery', discoveryEnd: iso(-24) };
    const first = await act<AuditEntry>('analysis.explore', payload);
    const second = await act<AuditEntry>('analysis.explore', { ...payload, name: 'Résultat non retenu', filter: { ...payload.filter, oddsMin: 1, oddsMax: 1.5 } });
    expect(second.id).not.toBe(first.id);
    const history = (await readState('personal')).audit.filter(entry => entry.action === 'analysis.explore');
    expect(history).toHaveLength(2);
    expect(JSON.parse(history.find(entry => entry.id === first.id)!.detail)).toMatchObject({ schemaVersion: 1, ...payload });
    await expect(act('analysis.explore', { ...payload, proof: 'validated' })).rejects.toThrow('Niveau de preuve');
    await expect(act('analysis.explore', { ...payload, proof: '' })).rejects.toThrow('Niveau de preuve');
    await expect(act('analysis.explore', { ...payload, filter: { kind: ['single'] } })).rejects.toThrow('textuel');
    await expect(act('analysis.explore', { ...payload, filter: { oddsMin: 2, oddsMax: 1.5 } })).rejects.toThrow('borne haute');
    await expect(act('analysis.explore', { ...payload, filter: { confidence: 99 } })).rejects.toThrow('Filtre inconnu');
    await expect(act('analysis.explore', { ...payload, simulationId: 'other-workspace' })).rejects.toThrow('dans cet espace');
    expect((await readState('personal')).audit.filter(entry => entry.action === 'analysis.explore')).toHaveLength(2);
  });
  it('fige un segment live avec délai négatif et refuse les intervalles vides', async () => {
    const profile = await tipster();
    const payload = { name: 'Live entre zéro et trente minutes', filter: { tipsterId: profile.id, timing: 'live', delayMinMinutes: -30, delayMaxMinutes: 0, oddsMin: 1, oddsMax: 1.5 }, discoveryEnd: iso(-24), validationStart: iso(1) };
    const strategy = await act<Strategy>('strategy.save', payload);
    expect(strategy.filter).toEqual(payload.filter);
    await expect(act('strategy.save', { ...payload, filter: { delayMinMinutes: 0, delayMaxMinutes: 0 } })).rejects.toThrow('strictement');
    await expect(act('strategy.save', { ...payload, filter: { oddsMin: 2, oddsMax: 2 } })).rejects.toThrow('strictement');
    expect((await readState('personal')).strategies).toHaveLength(1);
  });
  it('déclasse le segment corrigé après événement tout en conservant son observation originale', async () => {
    const profile = await tipster();
    const pick = await act<Pick>('pick.save', { tipsterId: profile.id, event: 'Preuve de segment', sport: 'Football', competition: 'Coupe', market: 'Vainqueur', selection: 'A', odds: 2, publishedAt: iso(-1), startsAt: iso(1) });
    expect(pick.evidence).toBe('observed');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(pick.startsAt) + 4 * 3600000));
    try {
      const corrected = await act<Pick>('pick.save', { id: pick.id, sport: 'Basketball', competition: 'Autre coupe' });
      expect(corrected.evidence).toBe('declared');
      expect(corrected.revisions[0].previous.evidence).toBe('observed');
      expect(corrected.revisions[0].previous.sport).toBe('Football');
      expect(corrected.initialContent).toBe(pick.initialContent);
    } finally {
      vi.useRealTimers();
    }
  });
  it('enrichit une ancienne démonstration sans remplacer ses données ni toucher au personnel', async () => {
    const complete = await seedDemo();
    const legacy = structuredClone(complete);
    for (const name of ['tipsters', 'picks', 'quotes', 'tickets', 'ledger', 'strategies', 'simulations', 'audit'] as const) {
      (legacy[name] as { id: string }[]) = legacy[name].filter(record => !record.id.startsWith('demo-analysis-v2'));
    }
    legacy.tipsters[0].notes = 'Annotation utilisateur conservée lors de la mise à niveau';
    legacy.settings.paused = true;
    legacy.settings.maxBetPercent = 0.005;
    await clearTestDatabase();
    await restoreState(legacy);
    const personalTipster = await tipster();
    await initial();
    const personalBefore = await readState('personal');
    const before = await readState('demo');
    const upgraded = await seedDemo();
    expect(upgraded.picks.length).toBeGreaterThan(before.picks.length);
    expect(upgraded.settings).toEqual(before.settings);
    for (const name of ['tipsters', 'picks', 'quotes', 'tickets', 'ledger', 'strategies', 'simulations', 'audit'] as const) {
      for (const original of before[name]) expect(upgraded[name].find(record => record.id === original.id)).toEqual(original);
    }
    expect(await readState('personal')).toEqual(personalBefore);
    expect(personalBefore.tipsters[0].id).toBe(personalTipster.id);
    expect((await seedDemo()).picks).toHaveLength(upgraded.picks.length);
  });
});

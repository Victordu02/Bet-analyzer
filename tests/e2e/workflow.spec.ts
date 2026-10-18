import {test,expect,type Page} from '@playwright/test';
import type {AppState,Pick,Strategy,Simulation} from '../../src/domain/types';
import {bankroll,pickStats} from '../../src/domain/calculations';

const origin=process.env.E2E_ORIGIN||'http://127.0.0.1:3100';
async function login(page:Page){
  await page.goto('/login');
  await page.getByLabel('Mot de passe',{exact:true}).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:'Ouvrir mon espace'}).click();
  await expect(page.getByRole('heading',{name:'Le radar',exact:true})).toBeVisible();
}
async function action<T>(page:Page,name:string,payload:Record<string,unknown>,workspace='personal'):Promise<T>{
  const response=await page.request.post('/api/actions',{headers:{origin},data:{workspace,action:name,payload}});
  const body=await response.json();expect(response.ok(),body.error).toBeTruthy();return body.result;
}
async function state(page:Page,workspace='personal'):Promise<AppState>{const response=await page.request.get('/api/data?workspace='+workspace);expect(response.ok()).toBeTruthy();return response.json();}
async function navigate(page:Page,label:string){await page.getByRole('button',{name:label==='Radar'?/^Radar(?:\s*\d+)?$/:label,exact:label!=='Radar'}).first().click();}

test('Base vide → import → profil → segment → cote → simulation → ticket → règlement → rapport → export',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  expect((await page.request.get('/api/export?workspace=personal')).status()).toBe(401);
  expect((await page.request.post('/api/actions',{headers:{origin:'https://example.invalid'},data:{workspace:'personal',action:'demo.seed',payload:{}}})).status()).toBe(403);
  await login(page);
  expect((await state(page)).picks).toHaveLength(0);
  await navigate(page,'Sources & imports');
  const csv='source_id;tipster;event;sport;competition;market;selection;rules;odds;stake_units;published_at;starts_at;result;settled_at;settlement_source\nRECETTE-1;Tipster de recette;Azur - Ocre;Football;Ligue de recette;1X2;Azur;Temps réglementaire;2,50;7;01/09/2026 10:00;01/09/2026 20:00;won;01/09/2026 22:00;Jeu de test isolé\nRECETTE-2;Tipster de recette;Jade - Ambre;Football;Ligue de recette;1X2;Jade;Temps réglementaire;1,90;2;02/09/2026 10:00;02/09/2026 20:00;lost;02/09/2026 22:00;Jeu de test isolé';
  await page.locator('#import-csv').fill(csv);
  await page.getByRole('button',{name:'Vérifier et prévisualiser'}).click();
  const commit=page.getByRole('button',{name:'Importer 2 lignes valides',exact:true});
  await expect(commit).toBeDisabled();
  await page.getByRole('checkbox',{name:/Je confirme avoir le droit/}).check();
  await commit.click();
  await expect.poll(async()=> (await state(page)).picks.length).toBe(2);
  const imported=await state(page);expect(imported.picks.every(p=>p.evidence==='declared')).toBe(true);
  expect(pickStats(imported.picks).profitUnits).toBe(0.5);
  await action(page,'import.commit',{kind:'picks',csv,fileName:'saisie.csv',mapping:{},rightsConfirmed:true});
  expect((await state(page)).picks).toHaveLength(2);
  await navigate(page,'Tipsters');
  await page.getByRole('button',{name:'Tipster de recette',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Déclaré');
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await navigate(page,'Spécialités');
  await expect(page.getByRole('heading',{name:'Spécialités & analyses',exact:true})).toBeVisible();

  const strategy=await action<Strategy>(page,'strategy.save',{name:'Règle de recette figée',filter:{tipsterId:imported.tipsters[0].id,sport:'Football',market:'1X2'},discoveryEnd:new Date(Date.now()-86400000).toISOString(),validationStart:new Date(Date.now()+1000).toISOString()});
  await new Promise(r=>setTimeout(r,1100));
  await action(page,'settings.save',{maxBetPercent:0.01,maxEventPercent:0.02,maxExposurePercent:0.05,dailyLossLimitCents:5000,monthlyLossLimitCents:10000});
  await action(page,'ledger.add',{kind:'initial',amountCents:100000,at:'2026-08-01T00:00:00Z',description:'Capital du test isolé'});
  const startsAt=new Date(Date.now()+15000).toISOString();
  const candidate=await action<Pick>(page,'pick.save',{tipsterId:imported.tipsters[0].id,sourceId:'RECETTE-FUTURE',event:'Équipe Verte — Équipe Bleue',sport:'Football',competition:'Recette',eventKey:'recette-future',market:'1X2',selection:'Équipe Verte',line:'',rules:'Temps réglementaire',publishedAt:new Date(Date.now()-1000).toISOString(),startsAt,odds:2,minOdds:1.9,stakeUnits:1});
  expect(candidate.evidence).toBe('observed');
  await action(page,'quote.save',{pickId:candidate.id,odds:2,observedAt:new Date().toISOString(),available:true,matchConfirmed:true,source:'Relevé manuel de recette'});
  const simulation=await action<Simulation>(page,'simulation.save',{name:'Panier test sans mouvement',strategyId:strategy.id,method:'kelly',candidates:[{pickId:candidate.id,probability:0.55,probabilitySource:'manual'}]});
  expect(simulation.allocations[0].stakeCents).toBe(1000);expect(bankroll(await state(page)).cashCents).toBe(100000);
  await page.reload();await expect(page.getByRole('heading',{name:'Le radar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:candidate.event,exact:true}).first().click();
  await expect(page.getByRole('dialog')).toContainText('Fiche de décision');
  await expect(page.getByRole('dialog')).toContainText('Relevé manuel de recette');
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await navigate(page,'Simulations & stratégies');
  await expect(page.getByRole('button',{name:'Panier test sans mouvement',exact:true})).toBeVisible();
  await navigate(page,'Mes paris & bankroll');
  await page.getByRole('button',{name:'Ticket réel',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.locator('[name=pickId]').selectOption(candidate.id);
  await dialog.locator('[name=sourceId]').fill('RECETTE-TICKET-1');
  await dialog.locator('[name=source]').fill('Ticket fictif accepté, base de recette uniquement');
  await dialog.locator('[name=odds]').fill('2.5');
  await dialog.locator('[name=stake]').fill('20');
  await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  const open=await state(page);expect(open.tickets).toHaveLength(1);expect(bankroll(open).cashCents).toBe(98000);expect(bankroll(open).openStakeCents).toBe(2000);
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(startsAt)-Date.now()+20)));
  const ticket=open.tickets[0];await action(page,'ticket.save',{id:ticket.id,result:'won',returnCents:5000,settledAt:new Date().toISOString()});
  const closed=await state(page);expect(bankroll(closed).cashCents).toBe(103000);expect(bankroll(closed).netProfitCents).toBe(3000);expect(bankroll(closed).openStakeCents).toBe(0);
  await action(page,'settings.save',{reconciliationBalanceCents:103000,reconciledAt:new Date().toISOString()});
  await page.reload();await expect(page.getByRole('heading',{name:'Le radar',exact:true})).toBeVisible();
  await navigate(page,'Rapports');await expect(page.getByRole('heading',{name:'Les rapports',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/rapport-desktop.png',fullPage:true});
  const exported=await page.request.get('/api/export?workspace=personal');const snapshot=await exported.json();
  expect(snapshot.version).toBe(1);expect(snapshot.data.tickets[0].returnCents).toBe(5000);expect(snapshot.data.ledger.reduce((sum:number,e:{amountCents:number})=>sum+e.amountCents,0)).toBe(103000);
  expect(JSON.stringify(snapshot)).not.toContain(process.env.E2E_PASSWORD!);
  await action(page,'demo.seed',{},'demo');expect((await state(page)).tickets).toHaveLength(1);expect((await state(page,'demo')).picks.length).toBeGreaterThan(10);
});

test('Navigation mobile, thème sombre, sources et isolement de la démonstration',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const menu=page.getByRole('button',{name:'Ouvrir le menu',exact:true});
  await menu.click();
  await navigate(page,'Sources & imports');await expect(page.getByRole('heading',{name:'Importer un fichier CSV'})).toBeVisible();
  await expect.poll(async()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/sources-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Activer le thème sombre'}).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme','dark');
  await menu.click();
  await navigate(page,'Paramètres');await expect(page.getByRole('heading',{name:'Les paramètres'})).toBeVisible();
  for(const [label,title]of [['Tipsters','Les tipsters'],['Spécialités','Spécialités & analyses'],['Rapports','Les rapports'],['Simulations & stratégies','Simulations & stratégies'],['Mes paris & bankroll','Mes paris & bankroll'],['Radar','Le radar']]){
    await menu.click();await navigate(page,label);await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
  }
  await page.getByRole('button',{name:'Explorer la démonstration'}).click();
  await expect(page.locator('.demo-banner')).toContainText(/fictiv|fictif/i);
  await page.screenshot({path:'test-results/radar-mobile-dark.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Activer le thème clair'}).click();
  await page.screenshot({path:'test-results/radar-desktop.png',fullPage:true,animations:'disabled'});
  await navigate(page,'Simulations & stratégies');
  await expect(page.getByRole('heading',{name:'Rejouer une stratégie figée'})).toBeVisible();
  expect(errors).toEqual([]);
});

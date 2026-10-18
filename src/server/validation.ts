import Decimal from 'decimal.js';
import {fromZonedTime, formatInTimeZone} from 'date-fns-tz';
import type {Pick, Result, Settings, Ticket} from '../domain/types';
import {randomUUID} from 'node:crypto';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objet de données attendu.');
  return value as Record<string,unknown>;
}
export function text(value: unknown, label: string, required = false, max = 20000): string {
  const output = value == null ? '' : String(value).trim();
  if (required && !output) throw new Error(`${label} est obligatoire.`);
  if (output.length > max) throw new Error(`${label} dépasse ${max} caractères.`);
  return output;
}
export function number(value: unknown, label:string, minimum = -Number.MAX_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === '' || value == null || typeof value === 'boolean') throw new Error(`${label} doit être un nombre.`);
  let parsed:number;
  try { parsed = new Decimal(String(value).replace(/[\s\u00a0\u202f€]/g,'').replace(',', '.')).toNumber(); }
  catch { throw new Error(`${label} doit être un nombre valide.`); }
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} doit être compris entre ${minimum} et ${maximum}.`);
  return parsed;
}
export function integer(value:unknown, label:string, minimum = 0): number {
  const parsed = number(value,label,minimum);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} doit être un entier en centimes.`);
  return parsed;
}
export function cents(value:unknown, label:string): number {
  const amount = new Decimal(number(value,label)).mul(100);
  if (!amount.isInteger()) throw new Error(`${label} ne doit pas dépasser deux décimales.`);
  return integer(amount.toNumber(),label);
}
export function boolean(value:unknown, fallback=false):boolean {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (['true','1','oui','yes'].includes(String(value).toLowerCase())) return true;
  if (['false','0','non','no'].includes(String(value).toLowerCase())) return false;
  throw new Error('Valeur booléenne attendue (oui/non).');
}
export function date(value:unknown, label:string, nullable:false):string;
export function date(value:unknown, label:string, nullable:true):string|null;
export function date(value:unknown, label:string, nullable=false):string|null {
  const raw=text(value,label,!nullable);
  if (!raw && nullable) return null;
  const french=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const local=french?`${french[3]}-${french[2]}-${french[1]}T${french[4]??'00'}:${french[5]??'00'}:${french[6]??'00'}`:raw;
  const hasOffset=/(Z|[+-]\d{2}:?\d{2})$/i.test(local);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(local)) throw new Error(`${label} : date ISO ou JJ/MM/AAAA HH:mm attendue.`);
  const parsed=hasOffset?new Date(local):fromZonedTime(local,'Europe/Paris');
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} : date invalide.`);
  if (!hasOffset) {
    const expected=local.length===10?`${local}T00:00:00`:local.length===16?`${local}:00`:local.slice(0,19);
    if (formatInTimeZone(parsed,'Europe/Paris',"yyyy-MM-dd'T'HH:mm:ss")!==expected) throw new Error(`${label} : date inexistante dans Europe/Paris.`);
  }
  return parsed.toISOString();
}
const results:Record<string,Result>={open:'open',ouvert:'open',won:'won',gagne:'won','gagné':'won',lost:'lost',perdu:'lost',void:'void',annule:'void','annulé':'void',half_won:'half_won','demi-gagné':'half_won',half_lost:'half_lost','demi-perdu':'half_lost',cashout:'cashout'};
export function result(value:unknown):Result {
  const parsed=results[String(value||'open').toLowerCase()];
  if (!parsed) throw new Error('Résultat inconnu.');
  return parsed;
}
export function enumValue<T extends string>(value:unknown, allowed:readonly T[], label:string, fallback:T):T {
  const parsed=value == null || value === '' ? fallback : String(value);
  if (!allowed.includes(parsed as T)) throw new Error(`${label} : valeur inconnue.`);
  return parsed as T;
}
export function eventKey(event:string, startsAt:string):string { return `${event.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}:${startsAt.slice(0,10)}`; }

export function validatePick(p:Pick):Pick {
  text(p.tipsterId,'Tipster',true); text(p.event,'Événement',true); text(p.market,'Marché',true); text(p.selection,'Sélection',true);
  p.odds=number(p.odds,'Cote',1.000001,100000); p.stakeUnits=number(p.stakeUnits,'Mise en unités',0,100000);
  if(p.minOdds!==null)p.minOdds=number(p.minOdds,'Cote minimum',1.000001,100000);
  p.publishedAt=date(p.publishedAt,'Publication',false);p.startsAt=date(p.startsAt,'Début',false);p.settledAt=date(p.settledAt,'Règlement',true);
  p.result=result(p.result);p.kind=enumValue(p.kind,['single','accumulator'],'Type','single');p.timing=enumValue(p.timing,['prematch','live'],'Moment','prematch');
  if(p.timing==='prematch' && p.publishedAt>p.startsAt)throw new Error('Un pari avant-match doit être publié avant son début.');
  if(p.result!=='open'&&!p.settlementSource)throw new Error('La source de règlement est obligatoire pour un résultat clôturé.');
  if(p.result!=='open'&&!p.settledAt)throw new Error('La date de règlement est obligatoire pour un résultat clôturé.');
  if(p.settledAt&&p.settledAt<p.publishedAt)throw new Error('Le règlement ne peut précéder la publication.');
  if(p.result==='open'&&p.settledAt)throw new Error('Un pronostic ouvert ne possède pas de date de règlement.');
  if(p.settledAt&&p.settledAt>new Date().toISOString())throw new Error('Le règlement ne peut être futur.');
  if(p.settledAt&&p.settledAt<p.startsAt&&p.result!=='cashout')throw new Error('Le règlement ne peut précéder le début de l’événement (hors cashout documenté).');
  return p;
}
export function validateTicket(t:Ticket):Ticket {
  text(t.event,'Événement',true);text(t.market,'Marché',true);text(t.selection,'Sélection',true);text(t.source,'Source du ticket réel',true);
  t.odds=number(t.odds,'Cote',1.000001,100000);t.stakeCents=integer(t.stakeCents,'Mise',1);t.returnCents=integer(t.returnCents,'Retour');t.feeCents=integer(t.feeCents,'Frais');
  t.placedAt=date(t.placedAt,'Prise du ticket',false);t.settledAt=date(t.settledAt,'Règlement',true);t.result=result(t.result);
  t.kind=enumValue(t.kind,['single','accumulator'],'Type','single');t.funding=enumValue(t.funding,['cash','freebet'],'Financement','cash');
  if(t.placedAt>new Date().toISOString())throw new Error('Un ticket réel ne peut être pris dans le futur.');
  if(t.result==='open' && (t.returnCents!==0||t.settledAt!==null))throw new Error('Un ticket ouvert ne possède ni retour ni date de règlement.');
  if(t.result!=='open'&&!t.settledAt)throw new Error('La date de règlement est obligatoire.');
  if(t.settledAt && (t.settledAt<t.placedAt||t.settledAt>new Date().toISOString()))throw new Error('La date de règlement est incohérente.');
  if(t.result==='lost'&&t.returnCents!==0)throw new Error('Un ticket perdu doit avoir un retour nul.');
  if(['won','half_won'].includes(t.result)&&t.returnCents===0)throw new Error('Un ticket gagnant doit préciser son retour réel.');
  if(t.partialCashout&&t.result!=='cashout')throw new Error('Le cashout partiel requiert le résultat cashout.');
  if(t.remainingStakeCents!==null){t.remainingStakeCents=integer(t.remainingStakeCents,'Mise restante');if(t.remainingStakeCents>t.stakeCents)throw new Error('La mise restante dépasse la mise initiale.');}
  if(t.partialCashout&&t.remainingStakeCents===0)throw new Error('Un cashout partiel doit conserver une mise ouverte positive ou inconnue.');
  return t;
}
export function validateSettings(s:Settings):Settings {
  s.currency='EUR';s.timezone='Europe/Paris';
  s.fixedStakeCents=integer(s.fixedStakeCents,'Mise fixe');s.stakePercent=number(s.stakePercent,'Fraction de mise',0,1);s.kellyFraction=number(s.kellyFraction,'Fraction Kelly',0,1);
  for(const key of ['maxBetPercent','maxEventPercent','maxExposurePercent'] as const)if(s[key]!==null)s[key]=number(s[key],key,0,1);
  for(const key of ['dailyLossLimitCents','monthlyLossLimitCents','reconciliationBalanceCents'] as const)if(s[key]!==null)s[key]=integer(s[key],key);
  s.quoteMaxAgeMinutes=integer(s.quoteMaxAgeMinutes,'Validité des cotes',1);if(s.quoteMaxAgeMinutes>1440)throw new Error('Validité des cotes limitée à 24 heures.');
  s.paused=boolean(s.paused);s.reconciledAt=date(s.reconciledAt,'Rapprochement',true);s.reportFrequency=enumValue(s.reportFrequency,['daily','weekly','monthly'],'Fréquence','weekly');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.reportHour))throw new Error('Heure du rapport invalide.');
  return s;
}

export function buildPick(data:Record<string,unknown>, previous?:Pick, imported=false):Pick {
  const now=new Date().toISOString();
  const p:Pick={
    id:previous?.id??randomUUID(),tipsterId:'',sourceId:'',sourceUrl:'',publishedAt:'',observedAt:now,startsAt:'',event:'',eventKey:'',sport:'Football',competition:'',market:'',selection:'',line:'',rules:'',odds:0,minOdds:null,stakeUnits:1,result:'open',settlementSource:'',settledAt:null,kind:'single',timing:'prematch',evidence:'declared',initialContent:'',argument:'',notes:'',revisions:[],manuallyCorrected:false,
    ...previous,
  };
  const strings=['tipsterId','sourceId','sourceUrl','publishedAt','startsAt','event','eventKey','sport','competition','market','selection','line','rules','settlementSource','argument','notes'] as const;
  for(const key of strings)if(data[key]!==undefined)p[key]=text(data[key],key);
  for(const key of ['odds','stakeUnits'] as const)if(data[key]!==undefined)p[key]=number(data[key],key);
  if(data.minOdds!==undefined)p.minOdds=data.minOdds===null||data.minOdds===''?null:number(data.minOdds,'Cote minimum');
  if(data.settledAt!==undefined)p.settledAt=date(data.settledAt,'Règlement',true);
  if(data.result!==undefined)p.result=result(data.result);
  if(data.kind!==undefined)p.kind=enumValue(data.kind,['single','accumulator'],'Type','single');
  if(data.timing!==undefined)p.timing=enumValue(data.timing,['prematch','live'],'Moment','prematch');
  validatePick(p);
  if(!p.eventKey)p.eventKey=eventKey(p.event,p.startsAt);
  const observed=!imported&&p.timing==='prematch'&&p.publishedAt<=now&&p.startsAt>now&&p.result==='open';
  if(!previous){p.evidence=observed?'observed':'declared';p.initialContent=JSON.stringify({...p,revisions:undefined,initialContent:undefined});}
  else if(['event','startsAt','publishedAt','market','selection','line','rules','odds','kind','timing'].some(key=>JSON.stringify(p[key as keyof Pick])!==JSON.stringify(previous[key as keyof Pick])))p.evidence='declared';
  if(imported)p.evidence='declared';
  return p;
}

export function buildTicket(data:Record<string,unknown>,previous?:Ticket):Ticket {
  const t:Ticket={id:previous?.id??randomUUID(),sourceId:'',pickId:null,bookmaker:'Winamax FR',event:'',eventKey:'',selection:'',market:'',line:'',rules:'',kind:'single',odds:0,stakeCents:0,funding:'cash',placedAt:'',settledAt:null,result:'open',returnCents:0,feeCents:0,remainingStakeCents:null,partialCashout:false,strategyId:null,source:'',notes:'',manuallyCorrected:false,revisions:[],...previous};
  for(const key of ['sourceId','bookmaker','event','eventKey','selection','market','line','rules','placedAt','source','notes'] as const)if(data[key]!==undefined)t[key]=text(data[key],key);
  for(const key of ['pickId','strategyId'] as const)if(data[key]!==undefined)t[key]=text(data[key],key)||null;
  for(const key of ['odds','stakeCents','returnCents','feeCents'] as const)if(data[key]!==undefined)t[key]=number(data[key],key);
  if(data.remainingStakeCents!==undefined)t.remainingStakeCents=data.remainingStakeCents===null||data.remainingStakeCents===''?null:integer(data.remainingStakeCents,'Mise restante');
  if(data.settledAt!==undefined)t.settledAt=date(data.settledAt,'Règlement',true);
  if(data.partialCashout!==undefined)t.partialCashout=boolean(data.partialCashout);
  if(data.result!==undefined)t.result=result(data.result);
  if(data.kind!==undefined)t.kind=enumValue(data.kind,['single','accumulator'],'Type','single');
  if(data.funding!==undefined)t.funding=enumValue(data.funding,['cash','freebet'],'Financement','cash');
  validateTicket(t);if(!t.eventKey)t.eventKey=eventKey(t.event,t.placedAt);
  return t;
}

import { authenticated, sameOrigin } from './auth';
import type { Workspace } from '@/domain/types';
export async function guard(request: Request, mutation = false) {
  if (mutation && !sameOrigin(request)) return Response.json({error:'Origine de la requête refusée.'},{status:403});
  if (!await authenticated()) return Response.json({error:'Connexion requise.'},{status:401});
  return null;
}
export function workspaceOf(value:unknown):Workspace { if(value==='personal'||value==='demo') return value; throw new Error('Espace de données invalide.'); }
export async function jsonBody(request:Request) {
  const reader=request.body?.getReader();
  if(!reader) throw new Error('Requête vide.');
  const chunks:Uint8Array[]=[]; let bytes=0;
  while(true) { const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength; if(bytes>6_000_000){await reader.cancel();throw new Error('Requête limitée à 6 Mo, dont 5 Mo maximum pour le fichier CSV.');} chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function apiError(error:unknown) {
  const e = error as {message?:string; code?:string; cause?:unknown};
  if (e.code || e.cause || /password|postgresql:\/\/|SELECT|INSERT|constraint/i.test(e.message || '')) {
    console.error('Erreur serveur', {code:e.code || 'database'});
    return Response.json({error:'Opération refusée. Vérifiez les données et la disponibilité de la base.'},{status:400});
  }
  return Response.json({error:e.message || 'Opération impossible.'},{status:400});
}

import {config} from 'dotenv';
import {readFile} from 'node:fs/promises';
import {readState,restoreState} from '../src/server/service';
import {closeDatabase} from '../src/db';
import type {AppState} from '../src/domain/types';
config({path:process.env.NODE_ENV==='test'?'.env.test.local':'.env.local',quiet:true});
const file=process.argv[2];
if(!file)throw new Error('Usage : npm run restore -- fichier.json. Configurez une base vide et arrêtez le serveur web pendant la restauration.');
try{
  const envelope=JSON.parse(await readFile(file,'utf8'));
  if(envelope.version!==1)throw new Error('Version de sauvegarde non reconnue.');
  const states:AppState[]=envelope.workspaces??(envelope.data?[envelope.data]:[]);
  if(!states.length||states.length>2||new Set(states.map(s=>s.workspace)).size!==states.length)throw new Error('Espaces invalides dans la sauvegarde.');
  if(states.some(s=>!['personal','demo'].includes(s.workspace)))throw new Error('Espace inconnu.');
  const current=await Promise.all(states.map(s=>readState(s.workspace)));
  const populated=current.some(s=>s.tipsters.length||s.tickets.length||s.ledger.length||s.audit.length);
  if(populated)throw new Error('Restauration réservée à une base vide. Conservez la base actuelle et configurez une nouvelle DATABASE_URL. Aucun historique existant ne sera écrasé.');
  for(const state of states)await restoreState(state);
  console.log('Restauration terminée. Vérifiez le rapprochement avant de reprendre la saisie.');
}finally{await closeDatabase();}

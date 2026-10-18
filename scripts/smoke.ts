import {config} from 'dotenv';
import {COOKIE,createSession,readCredentials} from '../src/server/auth';
config({path:'.env.local',quiet:true});
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:3000';
const credentials=await readCredentials();if(!credentials)throw new Error('Accès privé absent. Exécutez npm run setup.');
const anonymous=await fetch(origin+'/api/data?workspace=personal');
if(anonymous.status!==401)throw new Error('Le contrôle d’accès anonyme doit refuser la lecture.');
const cookie=`${COOKIE}=${createSession(credentials.version)}`;
for(const workspace of ['personal','demo']){
  const response=await fetch(`${origin}/api/data?workspace=${workspace}`,{headers:{Cookie:cookie}});
  if(!response.ok)throw new Error(`Lecture authentifiée impossible (${response.status}).`);
  const data=await response.json();
  if(data.workspace!==workspace||!Array.isArray(data.ledger)||!Array.isArray(data.picks))throw new Error('Réponse métier invalide.');
  console.log(`Lecture authentifiée et base vérifiées : ${workspace}, ${data.picks.length} pronostics, ${data.tickets.length} tickets.`);
}
console.log('Contrôles de démarrage réussis. Aucun secret affiché ni donnée modifiée.');

import {spawn,type ChildProcess} from 'node:child_process';
import {config} from 'dotenv';
import pg from 'pg';
async function command(args:string[]){return await new Promise<void>((resolve,reject)=>{const c=spawn('npm',args,{stdio:'inherit'});c.on('exit',code=>code===0?resolve():reject(new Error(`Commande ${args.join(' ')} interrompue (${code}).`)));c.on('error',reject);});}
await command(['run','setup']);config({path:'.env.local',quiet:true});
async function ready(){const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1000});try{await client.connect();await client.query('SELECT 1');return true;}catch{return false;}finally{await client.end().catch(()=>{});}}
const children:ChildProcess[]=[];
if(!await ready()){
  children.push(spawn(process.execPath,['--import','tsx','scripts/postgres.ts'],{stdio:'inherit'}));
  let available=false;
  for(let attempt=0;attempt<45;attempt++){if(await ready()){available=true;break;}await new Promise(r=>setTimeout(r,1000));}
  if(!available){children.forEach(c=>c.kill());throw new Error('PostgreSQL ne répond pas. Consultez sa sortie de démarrage.');}
}
await command(['run','db:migrate']);
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1'],{stdio:'inherit'});children.push(app);
function stop(){children.forEach(c=>c.kill('SIGTERM'));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);app.on('exit',code=>{stop();process.exitCode=code||0;});

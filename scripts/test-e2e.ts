import {config} from 'dotenv';
import {randomBytes,scryptSync} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import pg from 'pg';
config({path:'.env.local',quiet:true});
if(!process.env.DATABASE_URL)throw new Error('Lancez npm run setup puis db:start.');
const url=new URL(process.env.DATABASE_URL);
if(url.hostname!=='127.0.0.1')throw new Error('Le test automatique utilise uniquement une base PostgreSQL locale dédiée.');
const admin=new pg.Client({connectionString:new URL('/postgres',url).toString()});
await admin.connect();
if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',['prisme_e2e'])).rowCount)await admin.query('CREATE DATABASE prisme_e2e');
await admin.end();url.pathname='/prisme_e2e';
const testDb=new pg.Client({connectionString:url.toString()});await testDb.connect();
// Dedicated disposable test database only; the personal installation is never reset.
if((await testDb.query("SELECT to_regclass('public.workspaces') AS name")).rows[0].name)await testDb.query('TRUNCATE workspaces CASCADE');
await testDb.end();
const password=randomBytes(24).toString('base64url'),salt=randomBytes(32).toString('hex');
await mkdir('.local',{recursive:true,mode:0o700});
await writeFile('.local/e2e-auth.json',JSON.stringify({salt,hash:scryptSync(password,salt,64).toString('hex'),version:randomBytes(16).toString('hex')}),{mode:0o600});
const env={...process.env,DATABASE_URL:url.toString(),AUTH_FILE:'.local/e2e-auth.json',SESSION_SECRET:randomBytes(48).toString('hex'),APP_ORIGIN:'http://127.0.0.1:3100',E2E_ORIGIN:'http://127.0.0.1:3100',E2E_PASSWORD:password};
function run(args:string[]){return new Promise<number>((resolve,reject)=>{const child=spawn(process.execPath,args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>resolve(code??1));});}
if(await run(['--import','tsx','scripts/migrate.ts']))throw new Error('Migration de test échouée.');
const workspaces=new pg.Client({connectionString:url.toString()});await workspaces.connect();await workspaces.query("INSERT INTO workspaces(id) VALUES('personal'),('demo') ON CONFLICT DO NOTHING");await workspaces.end();
if(await run(['node_modules/next/dist/bin/next','build']))throw new Error('Build de production échoué.');
const server:ChildProcess=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{env,stdio:['ignore','pipe','pipe']});
let log='';server.stdout?.on('data',chunk=>{log=(log+chunk.toString()).slice(-6000);});server.stderr?.on('data',chunk=>{log=(log+chunk.toString()).slice(-6000);});
try{
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){try{if((await fetch(env.APP_ORIGIN+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!ready){console.error(log);throw new Error('Serveur de test indisponible.');}
  process.exitCode=await run(['node_modules/@playwright/test/cli.js','test']);
}finally{server.kill('SIGTERM');}

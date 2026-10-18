import EmbeddedPostgres from 'embedded-postgres';
import {config} from 'dotenv';
import {mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
process.umask(0o077);
config({path:'.env.local',quiet:true});
if(!process.env.DATABASE_URL)throw new Error('Lancez npm run setup avant de démarrer la base.');
const url=new URL(process.env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='55432')throw new Error('db:start gère uniquement PostgreSQL local sur 127.0.0.1:55432. Pour une base externe, démarrez votre service séparément.');
const databaseDir=resolve('.local/postgres');
await mkdir(databaseDir,{recursive:true,mode:0o700});
const database=new EmbeddedPostgres({databaseDir,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),port:55432,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
try{await access(resolve(databaseDir,'PG_VERSION'));}catch{await database.initialise();}
await database.start();
const client=new pg.Client({connectionString:new URL('/postgres',url).toString()});
await client.connect();
const name=decodeURIComponent(url.pathname.slice(1));
if(!/^[a-z][a-z0-9_]*$/.test(name))throw new Error('Nom de base local invalide.');
if(!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await client.query(`CREATE DATABASE "${name}"`);
await client.end();
console.log('PostgreSQL prêt sur 127.0.0.1:55432 ; données dans .local/postgres.');
let stopped=false;
async function stop(){if(stopped)return;stopped=true;await database.stop();process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
await new Promise(()=>{});

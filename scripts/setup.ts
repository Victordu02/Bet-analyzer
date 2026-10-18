import {randomBytes,scryptSync} from 'node:crypto';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {config} from 'dotenv';
await mkdir('.local',{recursive:true,mode:0o700});
try{await access('.env.local');}catch{
  const databasePassword=randomBytes(32).toString('hex');
  await writeFile('.env.local',`DATABASE_URL=postgresql://prisme:${databasePassword}@127.0.0.1:55432/prisme\nAPP_ORIGIN=http://127.0.0.1:3000\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nAUTH_FILE=.local/auth.json\n`,{mode:0o600,flag:'wx'});
}
config({path:'.env.local',quiet:true});
const authPath=process.env.AUTH_FILE||'.local/auth.json';
try{await access(authPath);}catch{
  const password=randomBytes(24).toString('base64url'),salt=randomBytes(32).toString('hex');
  await mkdir(path.dirname(authPath),{recursive:true,mode:0o700});
  await writeFile(authPath,JSON.stringify({salt,hash:scryptSync(password,salt,64).toString('hex'),version:randomBytes(16).toString('hex')}),{mode:0o600,flag:'wx'});
  await writeFile('.local/initial-password.txt',password+'\n',{mode:0o600,flag:'wx'});
  console.log('Accès privé créé. Mot de passe initial dans .local/initial-password.txt (ne pas partager).');
}
const env=await readFile('.env.local','utf8');
if(!env.includes('DATABASE_URL='))throw new Error('DATABASE_URL manque dans .env.local.');
console.log('Configuration locale prête. Les fichiers existants ont été conservés.');

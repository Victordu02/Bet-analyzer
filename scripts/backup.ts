import {config} from 'dotenv';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {readState} from '../src/server/service';
import {closeDatabase} from '../src/db';
config({path:process.env.NODE_ENV==='test'?'.env.test.local':'.env.local',quiet:true});
const output=process.argv[2]||`backups/prisme-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
try{
  await mkdir(dirname(output),{recursive:true,mode:0o700});
  const snapshot={version:1,exportedAt:new Date().toISOString(),workspaces:[await readState('personal'),await readState('demo')]};
  await writeFile(output,JSON.stringify(snapshot,null,2),{mode:0o600,flag:'wx'});
  console.log(`Sauvegarde créée : ${output}. Contient des données personnelles ; conserver en lieu sûr.`);
}finally{await closeDatabase();}

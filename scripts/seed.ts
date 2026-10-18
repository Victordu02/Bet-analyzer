import {config} from 'dotenv';
import {seedDemo} from '../src/server/service';
import {closeDatabase} from '../src/db';
config({path:'.env.local',quiet:true});
try{const state=await seedDemo();console.log(`Démonstration prête : ${state.tipsters.length} tipsters, ${state.picks.length} pronostics. Espace personnel préservé.`);}
finally{await closeDatabase();}

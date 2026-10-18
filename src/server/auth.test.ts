import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createSession,setPassword,verifyPassword,validSession,sameOrigin} from './auth';
let directory:string;
const prior={secret:process.env.SESSION_SECRET,auth:process.env.AUTH_FILE,origin:process.env.APP_ORIGIN};
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'prisme-auth-'));process.env.AUTH_FILE=join(directory,'auth.json');process.env.SESSION_SECRET=randomBytes(48).toString('hex');process.env.APP_ORIGIN='http://127.0.0.1:3000';});
afterAll(async()=>{await rm(directory,{recursive:true,force:true});if(prior.secret)process.env.SESSION_SECRET=prior.secret;else delete process.env.SESSION_SECRET;if(prior.auth)process.env.AUTH_FILE=prior.auth;else delete process.env.AUTH_FILE;if(prior.origin)process.env.APP_ORIGIN=prior.origin;else delete process.env.APP_ORIGIN;});
describe('Accès privé',()=>{
  it('vérifie le secret, rejette une session modifiée et révoque les sessions au changement de mot de passe',async()=>{
    const password=randomBytes(24).toString('hex'),record=await setPassword(password);
    expect(verifyPassword(password,record)).toBe(true);expect(verifyPassword('incorrect',record)).toBe(false);
    const token=createSession(record.version);expect(await validSession(token)).toBe(true);
    expect(await validSession(token+'x')).toBe(false);expect(await validSession(undefined)).toBe(false);
    await setPassword(randomBytes(24).toString('hex'));expect(await validSession(token)).toBe(false);
  });
  it('refuse les origines étrangères et sans Origin',()=>{
    expect(sameOrigin(new Request('http://127.0.0.1:3000/api/actions',{headers:{origin:'https://example.com'}}))).toBe(false);
    expect(sameOrigin(new Request('http://127.0.0.1:3000/api/actions'))).toBe(false);
    expect(sameOrigin(new Request('http://127.0.0.1:3000/api/actions',{headers:{origin:'http://127.0.0.1:3000'}}))).toBe(true);
  });
});

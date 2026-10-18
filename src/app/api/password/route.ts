import {cookies} from 'next/headers';
import {COOKIE,cookieOptions,createSession,readCredentials,setPassword,verifyPassword} from '@/server/auth';
import {guard,jsonBody,apiError} from '@/server/http';
export async function POST(request:Request) {
  const denied=await guard(request,true); if(denied)return denied;
  try {
    const {currentPassword,newPassword}=await jsonBody(request);
    const credentials=await readCredentials();
    if(!credentials||typeof currentPassword!=='string'||!verifyPassword(currentPassword,credentials)) throw new Error('Mot de passe actuel incorrect.');
    if(typeof newPassword!=='string')throw new Error('Nouveau mot de passe requis.');
    const updated=await setPassword(newPassword);
    (await cookies()).set(COOKIE,createSession(updated.version),cookieOptions());
    return Response.json({ok:true});
  }catch(e){return apiError(e);}
}

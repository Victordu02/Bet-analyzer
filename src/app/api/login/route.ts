import { cookies } from 'next/headers';
import { allowLogin, COOKIE, cookieOptions, createSession, readCredentials, sameOrigin, verifyPassword } from '@/server/auth';
import {jsonBody} from '@/server/http';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return Response.json({error:'Origine refusée.'},{status:403});
  if(!allowLogin()) return Response.json({error:'Trop de tentatives. Réessayez dans une minute.'},{status:429});
  try {
    const body=await jsonBody(request);
    const credentials=await readCredentials();
    if(!credentials) return Response.json({error:'Exécutez npm run setup depuis votre terminal.'},{status:503});
    if(typeof body.password!=='string'||!verifyPassword(body.password,credentials)) return Response.json({error:'Mot de passe incorrect.'},{status:401});
    (await cookies()).set(COOKIE,createSession(credentials.version),cookieOptions());
    return Response.json({ok:true});
  } catch { return Response.json({error:'Connexion impossible. Vérifiez la configuration locale.'},{status:400}); }
}

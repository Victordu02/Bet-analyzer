import {cookies} from 'next/headers';
import {COOKIE,sameOrigin} from '@/server/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request))return Response.json({error:'Origine refusée.'},{status:403});
  (await cookies()).delete(COOKIE); return Response.json({ok:true});
}

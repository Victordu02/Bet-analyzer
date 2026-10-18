import {readState} from '@/server/service';
import {guard,workspaceOf,apiError} from '@/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const denied=await guard(request); if(denied)return denied;
  try {return Response.json(await readState(workspaceOf(new URL(request.url).searchParams.get('workspace') || 'personal')), {headers:{'Cache-Control':'no-store'}});}
  catch(e){return apiError(e);}
}

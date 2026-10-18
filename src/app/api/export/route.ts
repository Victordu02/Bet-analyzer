import {readState} from '@/server/service';
import {guard,workspaceOf,apiError} from '@/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const denied=await guard(request);if(denied)return denied;
  try {
    const workspace=workspaceOf(new URL(request.url).searchParams.get('workspace')||'personal');
    return new Response(JSON.stringify({version:1,exportedAt:new Date().toISOString(),data:await readState(workspace)},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="prisme-${workspace}-${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'no-store'}});
  }catch(e){return apiError(e);}
}

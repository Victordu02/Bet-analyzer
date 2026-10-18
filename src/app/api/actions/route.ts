import {executeAction} from '@/server/service';
import {guard,workspaceOf,apiError,jsonBody} from '@/server/http';
export async function POST(request:Request) {
  const denied=await guard(request,true); if(denied)return denied;
  try {
    const {workspace,action,payload}=await jsonBody(request);
    if(typeof action!=='string')throw new Error('Action requise.');
    const result=await executeAction(workspaceOf(workspace),action,payload);
    return Response.json({result},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return apiError(e);}
}

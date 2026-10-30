import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {parseVersion} from '@/domain/create';
import {parseTaskUpdate} from '@/domain/tasks';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}) {
 const origin=appOrigin();
 if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const {weddingId}=await params,holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
 const user=await verifiedUser(client);
 if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Task not found.'}},404);
 let args:Record<string,unknown>;
 try {
  const raw=await request.text();if(raw.length>8192)throw Error('Task update is too large.');
  const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['task_id','version','fields'].includes(k)))throw Error('Invalid task request.');
  const version=parseVersion(body.version),update=parseTaskUpdate(body.fields);
  if(update.operation==='add'?body.task_id!==null:typeof body.task_id!=='string'||!uuid.test(body.task_id))throw Error('Invalid task reference.');
  args={p_id:weddingId,p_task:body.task_id,p_version:version,p_operation:update.operation,p_changes:update.changes,p_confirm:update.confirmed,p_override:update.override};
 }catch(error){return jsonResponse({error:{code:'VALIDATION',message:error instanceof SyntaxError?'Invalid task request.':error instanceof Error?error.message:'Invalid task request.'}},400);}
 const result=await client.rpc('update_task',args);
 let response;
 if(result.error){
  const code=result.error.code;
  if(code==='42501')response=jsonResponse({error:{code:'NOT_FOUND',message:'Task not found.'}},404);
  else if(['40001','55000','23514'].includes(code))response=jsonResponse({error:{code:'CONFLICT',message:code==='40001'?'Your plan changed. Reload before retrying.':code==='55000'?'This task is not editable. Reload to check its current state.':'This change needs confirmation or conflicts with a retained dependency. Reload and review.'}},409);
  else if(code?.startsWith('22')||code==='23503')response=jsonResponse({error:{code:'VALIDATION',message:'Review task fields and confirmation.'}},400);
  else response=jsonResponse({error:{code:'UNAVAILABLE',message:'The save could not be confirmed. Reload to check before retrying.'}},503);
 }else response=jsonResponse({data:result.data});
 holder.cookies.getAll().forEach(cookie=>response.cookies.set(cookie));return response;
}

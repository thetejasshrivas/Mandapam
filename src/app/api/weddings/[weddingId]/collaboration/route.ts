import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {boundedJson} from '@/lib/bounded-json';
import {memberLabels} from '@/domain/member-names';
import {parseCollaboration} from '@/domain/collaboration';
export const dynamic='force-dynamic';
async function handle(request:NextRequest,params:Promise<{weddingId:string}>,write:boolean){
 if(write){const origin=appOrigin();if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{message:'Request not allowed.'}},403);}
 const holder=jsonResponse(null),client=routeClient(request,holder);
 const reply=(body:unknown,status=200)=>{const r=jsonResponse(body,status);holder.cookies.getAll().forEach(c=>r.cookies.set(c));return r;};
 if(!client)return reply({error:{message:'Account access unavailable.'}},503);
 const user=await verifiedUser(client);if(!user)return reply({error:{message:'Sign in required.'}},401);
 const {weddingId}=await params;if(!uuid.test(weddingId))return reply({error:{message:'Task not available.'}},404);
 let rpc='task_members',args:Record<string,unknown>={p_id:weddingId};
 if(write){try{const parsed=parseCollaboration(await boundedJson(request,4096));rpc=parsed.operation==='assign'?'task_assign':'task_contribute';args={...args,...parsed.args};}catch{return reply({error:{message:'Review task fields, status and confirmation.'}},400);}}
 try{
  const result=await client.rpc(rpc,args);
  if(!result.error)return reply({data:write?result.data:memberLabels(result.data)});
  const code=result.error.code;
  if(code==='42501')return reply({error:{message:'Task or membership not available.'}},404);
  if(['40001','PT409','55000','23514','55P03','40P01'].includes(code))return reply({error:{message:'Plan changed, membership changed or a prerequisite needs review. Reload before trying again.'}},409);
  if(code.startsWith('22')||code==='23503')return reply({error:{message:'Review task fields and confirmation.'}},400);
 }catch{/* Unknown outcomes require an explicit reload, never automatic replay. */}
 return reply({error:{message:'Save could not be confirmed. Reload to check before trying again.'}},503);
}
export async function GET(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}){return handle(request,params,false);}
export async function POST(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}){return handle(request,params,true);}

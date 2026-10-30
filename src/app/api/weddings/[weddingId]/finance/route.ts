import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {parseVersion} from '@/domain/create';
import {parseFinanceInput} from '@/domain/finance-input';
import {loadFinance} from '@/server/finance';
export const dynamic='force-dynamic';
type Route={params:Promise<{weddingId:string}>};
export async function GET(request:NextRequest,{params}:Route){
 const {weddingId}=await params,holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);const user=await verifiedUser(client);
 if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Budget not found.'}},404);
 const result=await loadFinance(client,weddingId),response=result.error?jsonResponse({error:{code:'UNAVAILABLE',message:'Budget unavailable. Try again.'}},503):result.data?jsonResponse({data:result.data}):jsonResponse({error:{code:'NOT_FOUND',message:'Budget not found.'}},404);holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}
export async function POST(request:NextRequest,{params}:Route){
 const origin=appOrigin();if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const {weddingId}=await params,holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);const user=await verifiedUser(client);
 if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Budget not found.'}},404);
 let args:Record<string,unknown>,rpc:string;
 try{
  const raw=await request.text();if(raw.length>16384)throw Error('Finance form is too large.');const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['cost_id','entry_id','version','fields'].includes(k)))throw Error('Invalid finance request.');
  const update=parseFinanceInput(body.fields),version=parseVersion(body.version),cash=['post','void'].includes(update.operation);
  if(['create','budget'].includes(update.operation)?body.cost_id!==null:typeof body.cost_id!=='string'||!uuid.test(body.cost_id))throw Error('Invalid cost reference.');
  if(update.operation==='void'?typeof body.entry_id!=='string'||!uuid.test(body.entry_id):body.entry_id!==null)throw Error('Invalid cash reference.');
  rpc=cash?'finance_cash':'finance_cost';args={p_id:weddingId,p_cost:body.cost_id,p_version:version,p_operation:update.operation,p_fields:update.fields,p_confirm:update.confirmed,p_reason:update.reason,...(cash?{p_entry:body.entry_id}:{})};
 }catch(error){return jsonResponse({error:{code:'VALIDATION',message:error instanceof SyntaxError?'Invalid finance form.':error instanceof Error?error.message:'Invalid finance form.'}},400);}
 const result=await client.rpc(rpc,args);let response;
 if(result.error){const code=result.error.code;
  if(code==='42501')response=jsonResponse({error:{code:'NOT_FOUND',message:'Budget entry not found.'}},404);
  else if(['40001','PT409','23514','55000','23505'].includes(code))response=jsonResponse({error:{code:'CONFLICT',message:['40001','PT409'].includes(code)?'Your plan changed. Reload before retrying.':code==='55000'?'This entry is read only. Reload to check its state.':'Change refused. Review the recorded amount, intent or refund balance. Correct affected refunds before voiding a payment.'}},409);
  else if(code?.startsWith('22')||['23502','23503'].includes(code))response=jsonResponse({error:{code:'VALIDATION',message:'Review required fields, amounts, date and confirmation.'}},400);
  else response=jsonResponse({error:{code:'UNAVAILABLE',message:'The save outcome is unknown. Reload and check the history before retrying.'}},503);
 }else response=jsonResponse({data:result.data});holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}

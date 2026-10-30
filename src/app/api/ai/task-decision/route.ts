import type {NextRequest} from 'next/server';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {appOrigin} from '@/server/auth/config';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {boundedJson} from '@/lib/bounded-json';
import {verifyAiReceipt} from '@/lib/ai-receipt';
import {filterSuggestions} from '@/domain/ai';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
 const origin=appOrigin();if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const holder=jsonResponse(null),client=routeClient(request,holder);if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Draft access unavailable.'}},503);
 const user=await verifiedUser(client);if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 let weddingId:string,requestId:string,operation:string,title:string,ceremony:string|null;
 try{
  const row=await boundedJson(request,8192) as Record<string,unknown>;
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['wedding_id','receipt','index','operation','ceremony_id'].includes(key))||typeof row.wedding_id!=='string'||!uuid.test(row.wedding_id)||typeof row.receipt!=='string'||!['accept','dismiss'].includes(row.operation as string)||!Number.isInteger(row.index)||Number(row.index)<0||Number(row.index)>2||row.ceremony_id!=null&&(typeof row.ceremony_id!=='string'||!uuid.test(row.ceremony_id)))throw Error();
  const receipt=verifyAiReceipt(row.receipt,process.env.AI_RECEIPT_SECRET??'',user.id,row.wedding_id),item=receipt.suggestions[Number(row.index)];if(!item||!filterSuggestions([item],[]).length)throw Error();
  weddingId=row.wedding_id;requestId=receipt.request_id;operation=row.operation as string;title=item.title;ceremony=operation==='accept'?(row.ceremony_id as string|null??null):null;
 }catch{return jsonResponse({error:{code:'VALIDATION',message:'Suggestion receipt is invalid or expired. Request fresh suggestions.'}},400);}
 const result=await client.rpc('ai_task_decision',{p_id:weddingId,p_request:requestId,p_operation:operation,p_title:title,p_ceremony:ceremony});
 const code=result.error?.code,response=result.error?jsonResponse({error:{code:code==='42501'?'NOT_FOUND':code==='PT409'||code==='55000'?'CONFLICT':'UNAVAILABLE',message:code==='42501'?'Suggestion not found.':code==='PT409'||code==='55000'?'Your draft changed. Reload before deciding.':'Decision outcome unknown. Reload the draft before retrying.'}},code==='42501'?404:code==='PT409'||code==='55000'?409:503):jsonResponse({data:result.data});
 holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}

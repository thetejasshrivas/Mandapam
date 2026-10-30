import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {parseAdaptRequest,previewAdapt,type AdaptSnapshot} from '@/domain/adapt';
import {loadProposals} from '@/server/adapt';
export const dynamic='force-dynamic';
type Route={params:Promise<{weddingId:string}>};
export async function GET(request:NextRequest,{params}:Route) {
 const {weddingId}=await params,holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
 const user=await verifiedUser(client);if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
 const wedding=await client.from('weddings').select('id').eq('id',weddingId).eq('owner_user_id',user.id).eq('state','ACTIVE').maybeSingle();
 if(wedding.error)return jsonResponse({error:{code:'UNAVAILABLE',message:'Plan unavailable.'}},503);
 if(!wedding.data)return jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
 const selected=request.nextUrl.searchParams.get('proposal_id');
 if(selected!==null){
  if(!uuid.test(selected)||request.nextUrl.searchParams.getAll('proposal_id').length!==1||[...request.nextUrl.searchParams.keys()].some(key=>key!=='proposal_id'))return jsonResponse({error:{code:'VALIDATION',message:'Use one proposal reference.'}},400);
  const result=await client.rpc('adapt_outcome',{p_id:weddingId,p_proposal:selected});
  const response=result.error?jsonResponse({error:{code:'UNAVAILABLE',message:'Authoritative outcome unavailable. Do not submit another approval.'}},503):result.data?jsonResponse({data:result.data}):jsonResponse({error:{code:'NOT_FOUND',message:'Proposal not found.'}},404);
  holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
 }
 const history=await loadProposals(client,weddingId),response=history.error?jsonResponse({error:{code:'UNAVAILABLE',message:'Proposal history unavailable.'}},503):jsonResponse({data:history.data});
 holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}
export async function POST(request:NextRequest,{params}:Route) {
 const origin=appOrigin();if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const {weddingId}=await params,holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
 if(!await verifiedUser(client))return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
 let input:ReturnType<typeof parseAdaptRequest>;
 try{const body=await request.text();if(body.length>4096)throw Error();input=parseAdaptRequest(JSON.parse(body));}catch{return jsonResponse({error:{code:'VALIDATION',message:'Use one ceremony, a different positive count1–10000, and optional capacity1–50000.'}},400);}
 const result=input.operation==='initialize'?await client.rpc('initialize_guest_count',{p_id:weddingId,p_ceremony:input.ceremony_id,p_version:input.version,p_new:input.new_guest_count,p_confirmed:input.confirmed}):'proposal_id' in input?await client.rpc(input.operation==='approve'?'adapt_approve':'adapt_reject',{p_id:weddingId,p_proposal:input.proposal_id}):input.operation==='create'?await client.rpc('adapt_propose',{p_id:weddingId,p_ceremony:input.ceremony_id,p_version:input.version,p_new:input.new_guest_count,p_capacity:input.capacity}):await client.rpc('adapt_context',{p_id:weddingId,p_ceremony:input.ceremony_id,p_capacity:input.capacity});
 let response;
 if(result.error){const code=result.error.code;response=code==='42501'?jsonResponse({error:{code:'NOT_FOUND',message:'Ceremony or proposal not found.'}},404):['PT409','55000'].includes(code??'')?jsonResponse({error:{code:'CONFLICT',message:'The context changed or this proposal is terminal. Request a fresh preview.'}},409):code?.startsWith('22')?jsonResponse({error:{code:'VALIDATION',message:'Review the count, capacity and existing forecast bounds.'}},400):jsonResponse({error:{code:'UNAVAILABLE',message:'The outcome could not be confirmed. Reload history before retrying.'}},503);}
 else if(!result.data)response=jsonResponse({error:{code:'NOT_FOUND',message:'Active ceremony not found.'}},404);
 else if(input.operation==='initialize'||'proposal_id' in input)response=jsonResponse({data:result.data});
 else {
  try{const snapshot=(input.operation==='create'?result.data.preview_snapshot:result.data) as AdaptSnapshot;const preview=previewAdapt(snapshot,input.new_guest_count);response=jsonResponse({data:{snapshot,preview,proposal:input.operation==='create'?result.data:null}});}
  catch{response=jsonResponse({error:{code:'VALIDATION',message:'A known current count and valid recorded planning amounts are required. No headcount has changed; reload history before retrying a save.'}},400);}
 }
 holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}

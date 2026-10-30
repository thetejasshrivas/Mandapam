import type {NextRequest} from 'next/server';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {appOrigin} from '@/server/auth/config';
import {sameOrigin} from '@/server/auth/policy';
import {aiConfig} from '@/server/ai/config';
import {AI_MODEL,parseAiInput,safeAiContext,filterSuggestions} from '@/domain/ai';
import {boundedJson} from '@/lib/bounded-json';
import {requestSuggestions} from '@/lib/ai-provider';
import {sealAiReceipt} from '@/lib/ai-receipt';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request:NextRequest) {
 const origin=appOrigin();if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'AI_UNAVAILABLE',message:'AI suggestions unavailable'}},503);
 const user=await verifiedUser(client);if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 let input:ReturnType<typeof parseAiInput>;try{input=parseAiInput(await boundedJson(request,2048));}catch{return jsonResponse({error:{code:'VALIDATION',message:'Choose one to three saved ceremonies; no free-form context accepted.'}},400);}
 const wedding=await client.from('weddings').select('id,state,draft_locked').eq('id',input.wedding_id).eq('owner_user_id',user.id).maybeSingle();
 const finish=(response:ReturnType<typeof jsonResponse>)=>{holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;};
 if(wedding.error)return finish(jsonResponse({error:{code:'AI_UNAVAILABLE',message:'AI suggestions unavailable'}},503));
 if(!wedding.data)return finish(jsonResponse({error:{code:'NOT_FOUND',message:'Draft not found.'}},404));
 if(wedding.data.state!=='DRAFT'||!wedding.data.draft_locked)return finish(jsonResponse({error:{code:'CONFLICT',message:'Generate and review a draft before asking for optional suggestions.'}},409));
 const config=aiConfig();if(!config)return finish(jsonResponse({error:{code:'AI_UNAVAILABLE',message:'AI suggestions unavailable'}},503));
 const reservation=await client.rpc('ai_reserve',{p_id:input.wedding_id,p_ceremonies:input.ceremony_ids});
 if(reservation.error){const code=reservation.error.code;const response=code==='PT429'?jsonResponse({error:{code:'RATE_LIMITED',message:'AI request limit reached. Try later; the application allows one per minute and five per UTC day.'}},429):code==='42501'?jsonResponse({error:{code:'NOT_FOUND',message:'Ceremony not found.'}},404):code==='55000'?jsonResponse({error:{code:'CONFLICT',message:'Reviewable draft required.'}},409):jsonResponse({error:{code:'AI_UNAVAILABLE',message:'AI suggestions unavailable'}},503);if(code==='PT429')response.headers.set('Retry-After','60');return finish(response);}
 const context=reservation.data as {request_id:string;ceremonies:{id:string;title:string}[];tasks:{title:string;status:string;dismissed_at:string|null}[]};
 const safe=safeAiContext(context.ceremonies,context.tasks),result=await requestSuggestions(safe,config.key);
 if(!result.ok)return finish(jsonResponse({error:{code:'AI_UNAVAILABLE',message:'AI suggestions unavailable'}},503));
 const suggestions=filterSuggestions(result.suggestions,context.tasks.map(t=>t.title));
 const receipt=sealAiReceipt({user_id:user.id,wedding_id:input.wedding_id,request_id:context.request_id,suggestions},config.signing);
 return finish(jsonResponse({data:{suggestions,receipt,source:'LIVE_MODEL',model:AI_MODEL}}));
}

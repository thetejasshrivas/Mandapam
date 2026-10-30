import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin} from '@/server/auth/policy';
import {invitationResponse,invitationFailure} from '@/server/invitations';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const origin=appOrigin();
 if(!origin||!sameOrigin(origin,request.headers.get('origin')))return invitationResponse(null,{error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return invitationFailure(holder,'UNAVAILABLE');
 if(!await verifiedUser(client))return invitationResponse(holder,{error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 let operation:string;
 try{
  const text=await request.text();if(text.length>1024)throw Error();const body=JSON.parse(text);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!['generate','revoke'].includes(body.operation))throw Error();
  operation=body.operation;
 }catch{return invitationFailure(holder,'22023');}
 const result=await client.rpc(operation==='generate'?'connect_code_generate':'connect_code_revoke',{});
 if(result.error)return invitationFailure(holder,result.error.code??'UNAVAILABLE');
 if(result.data?.error)return invitationFailure(holder,result.data.error);
 if(operation==='revoke')return invitationResponse(holder,{data:{revoked:true}});
 const issued=result.data as {code:string;expires_at:string}|null;
 if(!issued||!/^[a-f0-9]{64}$/.test(issued.code)||typeof issued.expires_at!=='string')return invitationFailure(holder,'UNAVAILABLE');
 return invitationResponse(holder,{data:{code:issued.code,expires_at:issued.expires_at}},201);
}

import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {invitationResponse,invitationFailure,invitationInfo,type InvitationInfo} from '@/server/invitations';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}){
 const holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return invitationFailure(holder,'UNAVAILABLE');
 if(!await verifiedUser(client))return invitationResponse(holder,{error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 const {weddingId}=await params;if(!uuid.test(weddingId))return invitationFailure(holder,'42501');
 const result=await client.rpc('invitation_list',{p_id:weddingId});
 if(result.error)return invitationFailure(holder,result.error.code??'UNAVAILABLE');
 if(!Array.isArray(result.data))return invitationFailure(holder,'UNAVAILABLE');
 return invitationResponse(holder,{data:(result.data as InvitationInfo[]).map(invitationInfo)});
}
export async function POST(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}){
 const origin=appOrigin();
 if(!origin||!sameOrigin(origin,request.headers.get('origin')))return invitationResponse(null,{error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return invitationFailure(holder,'UNAVAILABLE');
 if(!await verifiedUser(client))return invitationResponse(holder,{error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 const {weddingId}=await params;if(!uuid.test(weddingId))return invitationFailure(holder,'42501');
 let body:Record<string,unknown>,reference:string,connect=false;
 try{
  const text=await request.text();if(text.length>1024)throw Error();body=JSON.parse(text);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
  connect=body.operation==='create'&&Object.hasOwn(body,'connect_code');
  const key=body.operation==='create'?(connect?'connect_code':'recipient_user_id'):body.operation==='revoke'?'invitation_id':body.operation==='revoke_member'?'member_user_id':null;
  if(!key||Object.keys(body).some(k=>k!=='operation'&&k!==key)||typeof body[key]!=='string'||!(connect?/^[a-f0-9]{64}$/:uuid).test(body[key] as string))throw Error();
  reference=body[key] as string;
 }catch{return invitationFailure(holder,'22023');}
 const name=body.operation==='create'?(connect?'invitation_issue_connect':'invitation_issue'):body.operation==='revoke'?'invitation_revoke':'membership_revoke';
 const args=body.operation==='create'?(connect?{p_id:weddingId,p_code:reference}:{p_id:weddingId,p_recipient:reference}):body.operation==='revoke'?{p_id:weddingId,p_invitation:reference}:{p_id:weddingId,p_member:reference};
 const result=await client.rpc(name,args);if(result.error)return invitationFailure(holder,result.error.code??'UNAVAILABLE');
 if(result.data?.error)return invitationFailure(holder,result.data.error);
 if(body.operation!=='create')return invitationResponse(holder,{data:{revoked:true}});
 const issued=result.data as {id:string;token:string;expires_at:string}|null;
 if(!issued||!uuid.test(issued.id)||!/^[a-f0-9]{64}$/.test(issued.token)||typeof issued.expires_at!=='string')return invitationFailure(holder,'UNAVAILABLE');
 const url=new URL('/api/invitations/accept',origin);url.hash='token='+issued.token;
 return invitationResponse(holder,{data:{id:issued.id,expires_at:issued.expires_at,invitation_url:url.toString()}},201);
}

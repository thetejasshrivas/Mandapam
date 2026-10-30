import {NextResponse,type NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {invitationResponse,invitationFailure} from '@/server/invitations';
export const dynamic='force-dynamic';
// Browser redirects inherit the original fragment. No lookup or acceptance on GET.
export function GET(request:NextRequest){
 if(request?.headers.get('accept')?.includes('text/html')){
  const origin=appOrigin();if(!origin)return invitationFailure(null,'UNAVAILABLE');
  const response=NextResponse.redirect(new URL('/family/accept',origin),303);
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('Vary','Accept, Cookie');return response;
 }
 return invitationResponse(null,{accept_method:'POST',requires_authentication:true});
}
export async function POST(request:NextRequest){
 const origin=appOrigin();if(!origin||!sameOrigin(origin,request.headers.get('origin')))return invitationResponse(null,{error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
 const holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return invitationFailure(holder,'UNAVAILABLE');
 if(!await verifiedUser(client))return invitationResponse(holder,{error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 let token:string;
 try{const text=await request.text();if(text.length>1024)throw Error();const body=JSON.parse(text);if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw Error();token=body.token;}
 catch{return invitationFailure(holder,'22023');}
 const result=await client.rpc('invitation_accept',{p_token:token});if(result.error)return invitationFailure(holder,result.error.code??'UNAVAILABLE');
 if(typeof result.data!=='string'||!uuid.test(result.data))return invitationFailure(holder,'UNAVAILABLE');
 return invitationResponse(holder,{data:{wedding_id:result.data}});
}

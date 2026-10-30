import {boundedJson} from '@/lib/bounded-json';
import { type NextRequest } from "next/server";
import { routeClient,verifiedUser,jsonResponse } from "@/server/auth/client";
import { weddingFields } from "@/server/auth/weddings";
import { appOrigin } from "@/server/auth/config";
import { sameOrigin,uuid } from "@/server/auth/policy";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}) {
  const response=jsonResponse(null),client=routeClient(request,response);
  if(!client)return jsonResponse({error:{code:"UNAVAILABLE",message:"Account access unavailable."}},503);
  const user=await verifiedUser(client);
  if(!user)return jsonResponse({error:{code:"UNAUTHENTICATED",message:"Sign in required."}},401);
  const {weddingId}=await params;
  if(!uuid.test(weddingId))return jsonResponse({error:{code:"NOT_FOUND",message:"Wedding not found."}},404);
  const {data,error}=await client.from("weddings").select(weddingFields).eq("id",weddingId).eq("owner_user_id",user.id).maybeSingle();
  const result=error?jsonResponse({error:{code:"UNAVAILABLE",message:"Workspace unavailable."}},503):data?jsonResponse({data}):jsonResponse({error:{code:"NOT_FOUND",message:"Wedding not found."}},404);
  response.cookies.getAll().forEach(c=>result.cookies.set(c));
  return result;
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}) {
  const origin=appOrigin();
  if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request not allowed.'}},403);
  const holder=jsonResponse(null),client=routeClient(request,holder);
  const reply=(body:unknown,status=200)=>{const result=jsonResponse(body,status);holder.cookies.getAll().forEach(c=>result.cookies.set(c));return result;};
  if(!client)return reply({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
  const user=await verifiedUser(client);
  if(!user)return reply({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
  const {weddingId}=await params;
  if(!uuid.test(weddingId))return reply({error:{code:'NOT_FOUND',message:'Wedding not available.'}},404);
  let input:Record<string,unknown>;
  try {
    input=await boundedJson(request,1024) as Record<string,unknown>;
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['confirmation','version'].includes(k))||typeof input.confirmation!=='string'||input.confirmation.length<1||input.confirmation.length>100||typeof input.version!=='string'||!/^(0|[1-9][0-9]*)$/.test(input.version)||input.version.length>19||BigInt(input.version)>9223372036854775807n)throw new Error('Invalid input');
  }catch{return reply({error:{code:'INVALID',message:'Enter the exact wedding name and reload if the plan changed.'}},400);}
  try {
    const {data,error}=await client.rpc('delete_wedding',{p_id:weddingId,p_confirmation:input.confirmation,p_version:input.version});
    if(!error&&data===true)return reply({data:{deleted:true}});
    if(error?.code==='42501')return reply({error:{code:'NOT_FOUND',message:'Wedding not available.'}},404);
    if(error?.code==='22023')return reply({error:{code:'INVALID',message:'Enter the exact wedding name.'}},400);
    if(['PT409','40001','55P03','40P01'].includes(error?.code??''))return reply({error:{code:'CONFLICT',message:'Plan changed or is busy. Reload and review before trying again.'}},409);
  }catch{/* An ambiguous network outcome must not be represented as success. */}
  return reply({error:{code:'UNAVAILABLE',message:'Deletion could not be confirmed. Reload your workspace before trying again.'}},503);
}

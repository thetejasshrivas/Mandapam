import { appOrigin } from "@/server/auth/config";
import { type NextRequest } from "next/server";
import { jsonResponse,routeClient,verifiedUser } from "@/server/auth/client";
import { weddingFields } from "@/server/auth/weddings";
import { sameOrigin,weddingInput } from "@/server/auth/policy";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const response=jsonResponse(null),client=routeClient(request,response);
  if(!client)return jsonResponse({error:{code:"UNAVAILABLE",message:"Account access unavailable."}},503);
  const user=await verifiedUser(client);
  if(!user)return jsonResponse({error:{code:"UNAUTHENTICATED",message:"Sign in required."}},401);
  const {data,error}=await client.from("weddings").select(weddingFields).eq("owner_user_id",user.id);
  const result=jsonResponse(error?{error:{code:"UNAVAILABLE",message:"Workspace unavailable."}}:{data},error?503:200);
  response.cookies.getAll().forEach(c=>result.cookies.set(c));
  return result;
}
export async function POST(request:NextRequest) {
  const origin=appOrigin();
  if(!origin||!sameOrigin(origin,request.headers.get("origin")))return jsonResponse({error:{code:"FORBIDDEN",message:"Request origin is not allowed."}},403);
  const response=jsonResponse(null),client=routeClient(request,response);
  if(!client)return jsonResponse({error:{code:"UNAVAILABLE",message:"Account access unavailable."}},503);
  const user=await verifiedUser(client);
  if(!user)return jsonResponse({error:{code:"UNAUTHENTICATED",message:"Sign in required."}},401);
  const formRequest=request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")??false;
  let input:unknown;
  try {
    const raw=await request.text();
    if(raw.length>2048)throw Error("Input too long");
    input=formRequest?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw);
  } catch { return jsonResponse({error:{code:"VALIDATION",message:"Invalid wedding details."}},400); }
  const details=weddingInput(input);
  if(!details)return jsonResponse({error:{code:"VALIDATION",message:"Enter a wedding title and city of 1–100 characters."}},400);
  const {data,error}=await client.rpc("create_wedding",{p_title:details.title,p_city:details.city});
  const result=error?jsonResponse({error:{code:error.code==="23505"?"CONFLICT":"UNAVAILABLE",message:error.code==="23505"?"This account already has a wedding.":"Wedding could not be created."}},error.code==="23505"?409:503):jsonResponse({data:{id:data}},201);
  response.cookies.getAll().forEach(c=>result.cookies.set(c));
  if(formRequest) {
    result.headers.set("Location",new URL(error?`/workspace?error=${error.code==="23505"?"exists":"save"}`:`/workspace/${data}`,origin!).toString());
    return new Response(null,{status:303,headers:result.headers});
  }
  return result;
}

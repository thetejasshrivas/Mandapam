import { type NextRequest } from "next/server";
import { routeClient,verifiedUser,jsonResponse } from "@/server/auth/client";
import { weddingFields } from "@/server/auth/weddings";
import { uuid } from "@/server/auth/policy";
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

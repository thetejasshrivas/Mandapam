import type {NextRequest} from 'next/server';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {uuid} from '@/server/auth/policy';
import {loadPlanning} from '@/server/planning';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{weddingId:string}>}){
 const holder=jsonResponse(null),client=routeClient(request,holder);
 if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
 if(!await verifiedUser(client))return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
 const {weddingId}=await params;
 if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
 const result=await loadPlanning(client,weddingId);
 const response=result.error?jsonResponse({error:{code:'UNAVAILABLE',message:'Planning unavailable.'}},503):result.data?jsonResponse({data:result.data}):jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
 holder.cookies.getAll().forEach(cookie=>response.cookies.set(cookie));
 return response;
}

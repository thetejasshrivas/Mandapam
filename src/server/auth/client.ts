import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { authConfig,cookieOptions } from "./config";
import { privateHeaders } from "./policy";

export function routeClient(request: NextRequest,response: NextResponse) {
  const config=authConfig();
  if(!config)return null;
  return createServerClient(config.url,config.key,{cookieOptions,cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:(values,headers)=>{
      values.forEach(({name,value,options})=>{request.cookies.set(name,value);response.cookies.set(name,value,options);});
      Object.entries(headers ?? {}).forEach(([key,value])=>response.headers.set(key,value));
      Object.entries(privateHeaders()).forEach(([key,value])=>response.headers.set(key,value));
    },
  }});
}
export async function serverClient() {
  const config=authConfig();
  if(!config)return null;
  const jar=await cookies();
  return createServerClient(config.url,config.key,{cookieOptions,cookies:{
    getAll:()=>jar.getAll(),
    // Refresh cookies are written by proxy; Server Components cannot write them.
    setAll:()=>{},
  }});
}
export async function verifiedUser(client: NonNullable<Awaited<ReturnType<typeof serverClient>>>) {
  try {
    const {data,error}=await client.auth.getUser();
    return !error&&data.user&&!data.user.is_anonymous&&data.user.email_confirmed_at ? data.user:null;
  } catch { return null; }
}
export function jsonResponse(data: unknown,status=200) { return NextResponse.json(data,{status,headers:privateHeaders()}); }

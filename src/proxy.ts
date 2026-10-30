import { createServerClient } from "@supabase/ssr";
import { NextResponse,type NextRequest } from "next/server";
import { authConfig,cookieOptions } from "./server/auth/config";
import { privateHeaders } from "./server/auth/policy";

export async function proxy(request: NextRequest) {
  let response=NextResponse.next({request});
  const config=authConfig();
  if(config) {
    const supabase=createServerClient(config.url,config.key,{cookieOptions,cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll:(values,headers)=>{
        values.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
        Object.entries(headers ?? {}).forEach(([key,value])=>response.headers.set(key,value));
      },
    }});
    // Refresh before rendering. Protected handlers separately confirm the live user.
    try { await supabase.auth.getClaims(); } catch { /* Fail closed in page/API guards. */ }
  }
  Object.entries(privateHeaders()).forEach(([key,value])=>response.headers.set(key,value));
  if(request.nextUrl.pathname==="/auth/callback"||request.nextUrl.pathname.startsWith("/family/")||request.nextUrl.pathname.startsWith("/api/family/")||request.nextUrl.pathname.startsWith("/api/invitations/")||/^\/api\/weddings\/[^/]+\/invitations$/.test(request.nextUrl.pathname))response.headers.set("Referrer-Policy","no-referrer");
  return response;
}
export const config={matcher:["/workspace/:path*","/family/:path*","/api/weddings/:path*","/api/invitations/:path*","/api/family/:path*","/api/ai/:path*","/login","/auth/:path*"]};

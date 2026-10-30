import { appOrigin,authConfig } from "@/server/auth/config";
import { type NextRequest,NextResponse } from "next/server";
import { routeClient,jsonResponse } from "@/server/auth/client";
import { credentialsInput,privateHeaders,safeReturnTo,sameOrigin } from "@/server/auth/policy";
export const dynamic="force-dynamic";
export async function POST(request: NextRequest,{params}:{params:Promise<{operation:string}>}) {
  const origin=appOrigin();
  if(!origin||!sameOrigin(origin,request.headers.get("origin")))return jsonResponse({error:{code:"FORBIDDEN",message:"Request origin is not allowed."}},403);
  const {operation}=await params;
  if(!["login","signup","logout","google"].includes(operation))return jsonResponse({error:{code:"NOT_FOUND",message:"Not found."}},404);
  const response=NextResponse.redirect(new URL("/workspace",origin!),{status:303,headers:privateHeaders()});
  const client=routeClient(request,response);
  let returnTo='/workspace';
  const go=(message:string)=>{const destination=new URL(`/login?message=${message}`,origin!);if(returnTo.startsWith('/family/'))destination.searchParams.set('next',returnTo);response.headers.set("Location",destination.toString());return response;};
  if(!client)return go("unavailable");
  if(operation==="logout") {
    try { await client.auth.signOut({scope:"local"}); } catch { /* Always expire local auth cookies below. */ }
    const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
    request.cookies.getAll().filter(c=>c.name.startsWith(`sb-${ref}-auth-token`)).forEach(c=>response.cookies.set(c.name,"",{path:"/",maxAge:0,httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"}));
    response.headers.set("Clear-Site-Data",'"cache", "storage"');
    return go("signed_out");
  }
  if(Number(request.headers.get("content-length")??0)>4096)return go("invalid");
  let form:FormData;
  try { form=await request.formData(); } catch { return go("invalid"); }
  returnTo=safeReturnTo(typeof form.get('next')==='string'?String(form.get('next')):null);
  if(operation==="google") {
    const callback=new URL("/auth/callback",origin!);
    callback.searchParams.set("next",safeReturnTo(typeof form.get("next")==="string"?String(form.get("next")):null));
    callback.searchParams.set("flow","google");
    try {
      const {data,error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:callback.toString(),skipBrowserRedirect:true}});
      if(error||!data.url)return go("oauth_unavailable");
      const destination=new URL(data.url),config=authConfig();
      if(!config||destination.protocol!=="https:"||destination.origin!==new URL(config.url).origin||destination.pathname!=="/auth/v1/authorize"||destination.searchParams.get("provider")!=="google"||destination.username||destination.password)return go("oauth_unavailable");
      response.headers.set("Location",destination.toString());
      return response;
    } catch { return go("oauth_unavailable"); }
  }
  const credentials=credentialsInput(form.get("email"),form.get("password"));
  if(!credentials)return go("invalid");
  try {
    if(operation==="login") {
      const {error}=await client.auth.signInWithPassword(credentials);
      if(error)return go("credentials");
      response.headers.set("Location",new URL(safeReturnTo(typeof form.get("next")==="string" ? String(form.get("next")):null),origin!).toString());
      return response;
    }
    if(credentials.password.length<12)return go("invalid");
    const confirmation=new URL('/auth/callback',origin!);if(returnTo.startsWith('/family/'))confirmation.searchParams.set('next',returnTo);
    await client.auth.signUp({...credentials,options:{emailRedirectTo:confirmation.toString()}});
    // Same public response for existing, new, provider-rejected and rate-limited addresses.
    return go("check_email");
  } catch { return go("unavailable"); }
}
export async function GET(request:NextRequest,{params}:{params:Promise<{operation:string}>}) {
  const {operation}=await params;
  const origin=appOrigin();
  if(!origin)return jsonResponse({error:{code:"UNAVAILABLE",message:"Account access unavailable."}},503);
  if(operation!=="callback")return jsonResponse({error:{code:"METHOD_NOT_ALLOWED",message:"Use POST."}},405);
  const response=NextResponse.redirect(new URL(safeReturnTo(request.nextUrl.searchParams.get("next")),origin!),{status:303,headers:privateHeaders()});
  // Callback URLs carry one-use codes; there are no forms on this redirect response.
  response.headers.set("Referrer-Policy","no-referrer");
  const fail=(message:string)=>{const destination=new URL(`/login?message=${message}`,origin!),returnTo=safeReturnTo(request.nextUrl.searchParams.get('next'));if(returnTo.startsWith('/family/'))destination.searchParams.set('next',returnTo);response.headers.set("Location",destination.toString());return response;};
  const providerError=request.nextUrl.searchParams.get("error");
  if(providerError||request.nextUrl.searchParams.has("error_code"))return fail(providerError==="access_denied"?"oauth_cancelled":"oauth_error");
  const client=routeClient(request,response),code=request.nextUrl.searchParams.get("code");
  if(client&&code&&code.trim()===code&&code.length<=2048) {
    try { const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return response; } catch { /* Generic failure below. */ }
  }
  return fail(request.nextUrl.searchParams.get("flow")==="google"?"oauth_error":"confirmation");
}

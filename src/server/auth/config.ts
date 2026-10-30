import "server-only";
import {deploymentOrigin} from '@/lib/deployment-origin';
export function authConfig() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url || !key || !key.startsWith("sb_publishable_"))return null;
  try {
    const endpoint=new URL(url);
    const local=process.env.NODE_ENV!=='production'&&endpoint.protocol==='http:'&&['localhost','127.0.0.1'].includes(endpoint.hostname)&&!endpoint.username&&!endpoint.password&&endpoint.pathname==='/'&&!endpoint.search&&!endpoint.hash;
    if(endpoint.protocol!=="https:"&&!local)return null;
  } catch { return null; }
  return {url,key};
}
export const cookieOptions={httpOnly:true,sameSite:"lax" as const,path:"/",secure:process.env.NODE_ENV==="production"};
export function appOrigin(): string|null {
  return deploymentOrigin(process.env,process.env.NODE_ENV==='production');
}

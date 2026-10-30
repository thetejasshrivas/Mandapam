export function deploymentOrigin(env:Record<string,string|undefined>,production:boolean):string|null {
 const configured=env.APP_ORIGIN??(env.VERCEL_ENV==='preview'&&env.VERCEL_URL&&/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL)?`https://${env.VERCEL_URL}`:undefined);
 if(!configured)return null;
 try{
  const origin=new URL(configured);
  if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)return null;
  if(origin.protocol!=='https:'&&!( !production&&origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))return null;
  return origin.origin;
 }catch{return null;}
}

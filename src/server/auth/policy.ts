const workspace=/^\/workspace(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/family)?)?$/i;
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeReturnTo(value: string|null): string { return value && (workspace.test(value)||value==='/family/connect'||value==='/family/accept') ? value : "/workspace"; }
export function sameOrigin(url: string, origin: string|null): boolean { return origin===new URL(url).origin; }
export function privateHeaders(): Record<string,string> {
  return {"Cache-Control":"private, no-store, max-age=0, must-revalidate",Pragma:"no-cache",Expires:"0",Vary:"Cookie","Referrer-Policy":"same-origin"};
}
export function weddingInput(input: unknown): {title:string;city:string}|null {
  if(!input || typeof input!=="object" || Array.isArray(input))return null;
  const value=input as Record<string,unknown>;
  if(Object.keys(value).some(key=>!['title','city'].includes(key)))return null;
  if(typeof value.title!=="string"||typeof value.city!=="string")return null;
  const title=value.title.trim(),city=value.city.trim();
  return title.length>=1&&title.length<=100&&city.length>=1&&city.length<=100 ? {title,city}:null;
}
export function credentialsInput(email: unknown,password: unknown): {email:string;password:string}|null {
  if(typeof email!=="string"||typeof password!=="string")return null;
  const address=email.trim();
  return address.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)&&password.length>=1&&password.length<=256 ? {email:address,password}:null;
}

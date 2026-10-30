export const credentialPattern=/^[a-f0-9]{64}$/;
export const pendingInvitationKey='mandapam.pending-invitation';
export function invitationTokenFromLink(value:string,origin:string):string|null{
 try{const url=new URL(value);return url.origin===origin&&!url.username&&!url.password&&!url.search&&['/api/invitations/accept','/family/accept'].includes(url.pathname)&&/^#token=[a-f0-9]{64}$/.test(url.hash)?url.hash.slice(7):null;}catch{return null;}
}
export function readPendingInvitation(raw:string|null,now=Date.now()):string|null{
 try{const value=JSON.parse(raw??'null');return value&&typeof value.token==='string'&&credentialPattern.test(value.token)&&Number.isFinite(value.expires_at)&&value.expires_at>now&&value.expires_at<=now+30*60*1000?value.token:null;}catch{return null;}
}
export function invitationStatus(value:{accepted_at:string|null;revoked_at:string|null;expires_at:string},now=Date.now()):string{
 if(value.accepted_at)return 'Accepted';if(value.revoked_at)return 'Revoked';
 const expiry=Date.parse(value.expires_at);return !Number.isFinite(expiry)?'Unknown':expiry<=now?'Expired':'Pending';
}
export function displayExpiry(value:string):string{
 const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST':'Expiry unavailable';
}
export async function familyPost(path:string,body:Record<string,unknown>):Promise<Record<string,unknown>>{
 let response:Response;
 try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});}catch{throw Error('The result could not be confirmed. Check your workspace or invitation history before trying again.');}
 if(!response.ok)throw Error(response.status===401?'Sign in with the intended account, then try again.':response.status===429?'Too many attempts. Wait ten minutes before trying again.':response.status===404?'This code or invitation is unavailable. It may be expired, used, revoked, or intended for another account.':response.status===409?'An invitation or membership is already recorded. Check Invitation History; removed Members cannot currently be reinstated.':'The request could not be confirmed. Reload and check before trying again.');
 try{const value=await response.json();if(!value?.data||typeof value.data!=='object'||Array.isArray(value.data))throw Error();return value.data;}catch{throw Error('The result could not be confirmed. Reload and check before trying again.');}
}
export async function copyFamilyValue(value:string):Promise<string>{
 try{await navigator.clipboard.writeText(value);return 'Copied. Share privately with the intended person.';}catch{return 'Automatic copy is unavailable. Select the value above and copy it manually.';}
}

import {createHmac,timingSafeEqual} from 'node:crypto';
import {validateSuggestions,type Suggestion} from '../domain/ai.ts';
type Receipt={user_id:string;wedding_id:string;request_id:string;suggestions:Suggestion[];expires_at:number};
function signature(value:string,key:string) {return createHmac('sha256',key).update('mandapam-ai-suggestions-v1\0'+value).digest();}
export function sealAiReceipt(value:Omit<Receipt,'expires_at'>,key:string,now=Date.now()) {
 if(key.length<32)throw Error('Signing configuration unavailable.');
 const data=Buffer.from(JSON.stringify({...value,expires_at:now+600000})).toString('base64url');return data+'.'+signature(data,key).toString('base64url');
}
export function verifyAiReceipt(token:string,key:string,userId:string,weddingId:string,now=Date.now()):Receipt {
 if(typeof token!=='string'||token.length>8192||key.length<32)throw Error('Invalid receipt.');
 const parts=token.split('.');if(parts.length!==2)throw Error('Invalid receipt.');
 const actual=Buffer.from(parts[1],'base64url'),expected=signature(parts[0],key);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid receipt.');
 const row=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')) as Receipt;
 if(row.user_id!==userId||row.wedding_id!==weddingId||!Number.isSafeInteger(row.expires_at)||row.expires_at<=now||row.expires_at>now+600000)throw Error('Receipt expired or belongs to another account.');
 row.suggestions=validateSuggestions({suggestions:row.suggestions});return row;
}

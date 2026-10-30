import {toPaise,calendarDate} from './create.ts';
export function parseFinanceInput(input:unknown):{operation:string;fields:Record<string,unknown>;confirmed:boolean;reason:string|null} {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid finance form.');const raw=input as Record<string,unknown>,operation=raw.operation;
 const allowed:Record<string,string[]>={create:['title','ceremony_id','pricing_basis','amount'],edit:['title','pricing_basis','amount'],state:['state','amount','confirmed'],correct:['amount','confirmed','reason'],expected_refund:['amount'],archive:['confirmed'],budget:['amount'],post:['kind','amount','occurred_on','intent_key','note'],void:['confirmed','reason']};
 if(typeof operation!=='string'||!allowed[operation]||Object.keys(raw).some(k=>k!=='operation'&&!allowed[operation].includes(k)))throw Error('Unsupported finance field.');
 const text=(value:unknown,max:number,required=false)=>{if(value==null||value===''){if(required)throw Error('Required text missing.');return null;}if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())throw Error('Invalid text.');return value.trim()||null;};
 const flag=(value:unknown)=>{if(value==null||value==='')return false;if(value!=='on')throw Error('Use explicit confirmation.');return true;};
 const confirmed=flag(raw.confirmed),reason=text(raw.reason,1000);
 if(['state','correct','archive','void'].includes(operation)&&!confirmed)throw Error('Confirm this change.');if(['correct','void'].includes(operation)&&!reason)throw Error('A reason is required.');
 let fields:Record<string,unknown>={};
 if(['create','edit'].includes(operation)){
  fields.title=text(raw.title,160,true);
  if(operation==='create'||raw.pricing_basis!==undefined){if(!['FIXED','PER_GUEST'].includes(String(raw.pricing_basis)))throw Error('Choose pricing basis.');const amount=toPaise(raw.amount);fields={...fields,pricing_basis:raw.pricing_basis,fixed_estimate_paise:raw.pricing_basis==='FIXED'?amount:null,per_guest_rate_paise:raw.pricing_basis==='PER_GUEST'?amount:null};}
  if(operation==='create'){const ceremony=text(raw.ceremony_id,36);if(ceremony&&!/^[0-9a-f-]{36}$/i.test(ceremony))throw Error('Invalid ceremony.');fields.ceremony_id=ceremony;}
 }else if(['state','correct','budget'].includes(operation)){
  const amount=toPaise(raw.amount);if(operation==='correct'&&amount===null)throw Error('Record the corrected amount.');fields.amount_paise=amount;
  if(operation==='state'){if(!['COMMITTED','FINAL','CANCELLED'].includes(String(raw.state)))throw Error('Invalid financial state.');if(raw.state!=='CANCELLED'&&amount===null)throw Error('Record the amount.');fields.state=raw.state;}
 }else if(operation==='expected_refund')fields.expected_refund_paise=toPaise(raw.amount);
 else if(operation==='post'){
  if(!['PAYMENT','REFUND_RECEIVED'].includes(String(raw.kind)))throw Error('Choose payment or received refund.');const amount=toPaise(raw.amount);if(amount===null||BigInt(amount)<=0n)throw Error('Cash must be positive.');const date=calendarDate(raw.occurred_on);if(!date)throw Error('Occurrence date required.');fields={kind:raw.kind,amount_paise:amount,occurred_on:date,intent_key:text(raw.intent_key,160,true),note:text(raw.note,1000)};
 }
 return {operation,fields,confirmed,reason};
}

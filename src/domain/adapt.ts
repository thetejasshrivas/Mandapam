import {parseVersion} from './create.ts';
import {forecastCost,previewGuestCost,type CostItem,type FinanceCeremony} from './finance.ts';
export type AdaptTask={id:string;wedding_id:string;ceremony_id:string|null;title:string;status:string;due_date:string|null;completed_at:string|null;archived_at:string|null;dismissed_at:string|null};
export type AdaptSnapshot={schema_version:number;wedding:{id:string;state:string;state_version:string;wedding_date:string|null};ceremony:FinanceCeremony&{title:string;ceremony_date:string|null;venue_capacity:number|null};capacity:{value:number|null;source:string};costs:(CostItem&{title:string})[];tasks:AdaptTask[];protected_records:{task_ids:string[];cost_item_ids:string[];cash_entry_ids:string[]}};
function positive(value:unknown,max=10000):number {if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>max)throw Error(`Use a positive whole number up to ${max}.`);return value;}
export function previewAdapt(snapshot:AdaptSnapshot,newCount:number) {
 const {wedding,ceremony,costs,tasks,capacity}=snapshot;
 if(snapshot.schema_version!==1||wedding.state!=='ACTIVE'||ceremony.is_archived||ceremony.wedding_id!==wedding.id)throw Error('An active, same-wedding ceremony is required.');
 const oldCount=positive(ceremony.guest_count);positive(newCount);if(oldCount===newCount)throw Error('Choose a different guest count.');parseVersion(wedding.state_version);
 if(capacity.value!==null)positive(capacity.value,50000);if(!['RECORDED','SCENARIO','UNKNOWN'].includes(capacity.source)||capacity.source==='UNKNOWN'&&capacity.value!==null)throw Error('Invalid capacity provenance.');
 const unknowns:string[]=[],estimates=costs.filter(item=>!item.archived_at).map(item=>{
  if(item.wedding_id!==wedding.id||item.ceremony_id!==null&&item.ceremony_id!==ceremony.id)throw Error('Invalid same-ceremony cost context.');
  const parent=item.ceremony_id===ceremony.id?ceremony:null;
  const recalculated=item.state==='PLANNED'&&item.pricing_basis==='PER_GUEST'&&parent!==null&&item.commitment_paise===null&&item.actual_paise===null&&item.cancellation_settlement_paise===null;
  const before=forecastCost(item,parent),impact=recalculated?previewGuestCost(item,parent,newCount):{before_paise:before.amount_paise,after_paise:before.amount_paise,delta_paise:before.amount_paise===null?null:'0'};
  if(impact.after_paise===null)unknowns.push(`${item.title}: ${before.reason.replaceAll('_',' ').toLowerCase()}.`);
  return {id:item.id,title:item.title,state:item.state,pricing_basis:item.pricing_basis,rate_paise:recalculated?item.per_guest_rate_paise:null,...impact,recalculated,manual_reconfirmation:!recalculated,label:recalculated?'Derived planning estimate — not a vendor quote':'Recorded terms unchanged — manual reconfirmation required'};
 });
 for(const task of tasks)if(task.wedding_id!==wedding.id||task.ceremony_id!==null&&task.ceremony_id!==ceremony.id)throw Error('Invalid same-ceremony task context.');
 if(capacity.value===null)unknowns.push('Venue capacity not recorded; availability is unknown.');
 return {facts:{ceremony_id:ceremony.id,ceremony_title:ceremony.title,old_count:oldCount,new_count:newCount,delta:newCount-oldCount,percentage_change_approx:((newCount-oldCount)*100/oldCount).toFixed(2)+'%',base_version:wedding.state_version},estimates,capacity_warning:capacity.value!==null&&newCount>capacity.value?{capacity:capacity.value,excess:newCount-capacity.value,source:capacity.source}:null,capacity:{...capacity},tasks_to_review:tasks.filter(t=>!t.archived_at&&!t.dismissed_at&&t.ceremony_id===ceremony.id).map(t=>({...t})),assumptions:['Only recorded user-entered rates drive eligible planning estimates; these are not vendor quotes.','Fixed, committed, final and cancelled terms remain unchanged; manually reconfirm vendor arrangements.','Capacity is user-recorded or scenario-only, not vendor availability. No tasks are created or changed.'],unknowns,protected_records:structuredClone(snapshot.protected_records)};
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAdaptRequest(input:unknown):{operation:'preview'|'create';ceremony_id:string;new_guest_count:number;capacity:number|null;version?:string}|{operation:'reject'|'approve';proposal_id:string}|{operation:'initialize';ceremony_id:string;new_guest_count:number;version:string;confirmed:true} {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid ADAPT request.');
 const row=input as Record<string,unknown>,operation=row.operation;
 if(operation==='initialize') {
  if(Object.keys(row).some(k=>!['operation','ceremony_id','new_guest_count','version','confirmed'].includes(k))||row.confirmed!=='on'||typeof row.ceremony_id!=='string'||!uuid.test(row.ceremony_id)||typeof row.new_guest_count!=='string'||!/^\d+$/.test(row.new_guest_count))throw Error('Confirm an unknown guest-count initialization.');
  return {operation,ceremony_id:row.ceremony_id,new_guest_count:positive(Number(row.new_guest_count)),version:parseVersion(row.version),confirmed:true};
 }
 if(operation==='reject'||operation==='approve') {if(Object.keys(row).some(k=>!(operation==='approve'?['operation','proposal_id','confirmed']:['operation','proposal_id']).includes(k))||typeof row.proposal_id!=='string'||!uuid.test(row.proposal_id))throw Error('Invalid proposal.');if(operation==='approve'&&row.confirmed!=='on')throw Error('Explicit confirmation is required.');return {operation,proposal_id:row.proposal_id};}
 if(!['preview','create'].includes(operation as string)||Object.keys(row).some(k=>!['operation','ceremony_id','new_guest_count','capacity',...(operation==='create'?['version']:[])].includes(k))||typeof row.ceremony_id!=='string'||!uuid.test(row.ceremony_id))throw Error('Unsupported ADAPT request.');
 const integer=(value:unknown,max:number)=>{if(typeof value!=='string'||!/^\d+$/.test(value))throw Error('Use a positive whole number.');return positive(Number(value),max);};
 const result={operation:operation as 'preview'|'create',ceremony_id:row.ceremony_id,new_guest_count:integer(row.new_guest_count,10000),capacity:row.capacity==null||row.capacity===''?null:integer(row.capacity,50000)};
 return operation==='create'?{...result,version:parseVersion(row.version)}:result;
}

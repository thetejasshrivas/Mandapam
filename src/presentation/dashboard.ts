// Read-only presentation adapter. Existing domain functions remain authoritative.
import type {Draft,DraftTask} from '../domain/create.ts';
import {evaluateCost,sumPaise,summarizeWedding} from '../domain/finance.ts';
import {rankActions} from '../domain/priorities.ts';
import type {FinanceSnapshot} from '../server/finance.ts';

export function taskProgress(tasks:readonly DraftTask[],ceremonyId?:string){
 const rows=tasks.filter(t=>!t.archived_at&&!t.dismissed_at&&(ceremonyId===undefined||t.ceremony_id===ceremonyId));
 const count=(status:string)=>rows.filter(t=>t.status===status).length;
 return{total:rows.length,completed:count('COMPLETED'),inProgress:count('IN_PROGRESS'),toDo:count('TO_DO'),deferred:count('DEFERRED'),percent:rows.length?Math.floor(count('COMPLETED')*100/rows.length):null};
}
export function ratioPercent(part:string,whole:string):number{
 if(!/^(0|[1-9]\d*)$/.test(part)||!/^(0|[1-9]\d*)$/.test(whole))throw Error('Invalid geometry amount');
 const p=BigInt(part),w=BigInt(whole);if(p>w)throw Error('Segment exceeds total');
 // Only a bounded0..10000 basis-point integer crosses into Number; money never does.
 return w===0n?0:Number(p*10000n/w)/100;
}
export function financePresentation(draft:Draft,finance:FinanceSnapshot|null){
 if(!finance)return null;
 if(finance.wedding.id!==draft.wedding.id)throw Error('Cross-wedding finance');
 if(finance.wedding.state_version!==draft.wedding.state_version)return null;
 const summary=summarizeWedding(draft.wedding.id,finance.items,finance.ceremonies,finance.cash,finance.wedding.budget_ceiling_paise);
 const items=finance.items.filter(i=>!i.archived_at),committed=items.filter(i=>i.state==='COMMITTED');
 const recognized=items.map(i=>evaluateCost(i,finance.ceremonies.find(c=>c.id===i.ceremony_id)??null,finance.cash.filter(e=>e.cost_item_id===i.id)));
 const knownObligations=sumPaise(recognized.filter(r=>r.obligation.kind==='KNOWN').map(r=>r.obligation.amount_paise!));
 const coveredKnown=(BigInt(knownObligations)-BigInt(summary.outstanding_known_paise)).toString();
 return{summary,committedKnown:sumPaise(committed.flatMap(i=>i.commitment_paise===null?[]:[i.commitment_paise])),unknownCommitments:committed.filter(i=>i.commitment_paise===null).length,knownObligations,coveredKnown,coveredPercent:ratioPercent(coveredKnown,knownObligations),recentCash:finance.cash.filter(e=>e.status==='POSTED').slice().sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)||b.id.localeCompare(a.id)).slice(0,2).map(e=>({id:e.id,kind:e.kind,amount:e.amount_paise,date:e.occurred_on,title:finance.items.find(i=>i.id===e.cost_item_id)?.title??'Recorded cost'}))};
}
type ProposalRecord={id:string;wedding_id:string;ceremony_id:string;old_guest_count:number;new_guest_count:number;status:string;base_wedding_version:string;created_at:string};
export function proposalPresentation(draft:Draft,proposals:readonly ProposalRecord[]){
 const available=proposals.filter(p=>p.wedding_id===draft.wedding.id&&draft.ceremonies.some(c=>c.id===p.ceremony_id&&!c.is_archived)&&['PENDING','APPLIED','REJECTED'].includes(p.status)).slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 const p=available.find(p=>p.status==='PENDING')??available[0];if(!p)return null;
 const ceremony=draft.ceremonies.find(c=>c.id===p.ceremony_id)!;
 return{id:p.id,ceremony:ceremony.title,status:p.status as 'PENDING'|'APPLIED'|'REJECTED',oldCount:p.old_guest_count,newCount:p.new_guest_count,currentCount:ceremony.guest_count,stale:p.status==='PENDING'&&p.base_wedding_version!==draft.wedding.state_version};
}
const activityLabels:Record<string,string>={COST_CREATED:'Cost item recorded',COST_ESTIMATE_EDITED:'Planning estimate updated',COST_TITLE_EDITED:'Cost title updated',COST_EXPECTED_REFUND_EDITED:'Expected refund recorded',COST_STATE_CHANGED:'Financial state recorded',COST_AMOUNT_CORRECTED:'Recorded amount corrected',COST_ARCHIVED:'Planned cost archived',CASH_POSTED:'Cash entry recorded',CASH_VOIDED:'Cash correction retained',BUDGET_CEILING_CHANGED:'Budget ceiling updated'};
export function safeActivity(finance:FinanceSnapshot|null){return(finance?.audit??[]).filter(e=>Object.hasOwn(activityLabels,e.action)).slice().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id)).slice(0,3).map(e=>({id:e.id,label:activityLabels[e.action],time:e.created_at}));}
export function dashboardPresentation(draft:Draft,finance:FinanceSnapshot|null,proposals:readonly ProposalRecord[],today:string){
 const money=financePresentation(draft,finance);
 return{progress:taskProgress(draft.tasks),ranking:rankActions(draft.tasks,today),ceremonies:draft.ceremonies.filter(c=>!c.is_archived).map(c=>({...c,progress:taskProgress(draft.tasks,c.id)})),money,proposal:proposalPresentation(draft,proposals),activity:money?safeActivity(finance):[],offlineOwners:new Set(draft.tasks.filter(t=>!t.dismissed_at&&!t.archived_at&&t.owner_name).map(t=>t.owner_name)).size};
}
export type DashboardModel=ReturnType<typeof dashboardPresentation>;

import {calendarDate,displayDate,type DraftTask} from './create.ts';
import {readiness} from './tasks.ts';
export function istDate(now:Date):string {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function createdMicros(value:string|undefined):bigint {
 if(!value||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw Error('Task creation timestamp with timezone is required.');
 calendarDate(value.slice(0,10));
 const milliseconds=Date.parse(value);if(!Number.isFinite(milliseconds))throw Error('Invalid task creation timestamp.');
 const fraction=value.match(/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/)?.[1]??'';
 return BigInt(milliseconds)*1000n+BigInt(fraction.padEnd(6,'0').slice(3));
}
export function rankActions(tasks:readonly DraftTask[],today:string) {
 if(!calendarDate(today))throw Error('A current IST date is required.');
 const all=[...tasks],retained=all.filter(t=>!t.archived_at&&!t.dismissed_at),blocked:{task:DraftTask;reason:string}[]=[];
 const ready=retained.filter(task=>{
  const state=readiness(task,all);
  if(state.blocked){const parent=all.find(t=>t.id===task.prerequisite_task_id);blocked.push({task,reason:parent?`Waiting for ${parent.title} (${parent.archived_at?'archived':parent.dismissed_at?'dismissed':parent.status}). Review this prerequisite.`:'Prerequisite unavailable. Review this dependency.'});}
  return state.ready;
 });
 const created=new Map<string,bigint>();
 for(const task of ready){if(task.due_date)calendarDate(task.due_date);created.set(task.id,createdMicros(task.created_at));}
 const direct=(id:string)=>retained.filter(t=>t.prerequisite_task_id===id&&t.status!=='COMPLETED').length;
 ready.sort((a,b)=>compare(a.due_date??'9999-12-32',b.due_date??'9999-12-32')||direct(b.id)-direct(a.id)||(created.get(a.id)!<created.get(b.id)!?-1:created.get(a.id)!>created.get(b.id)!?1:0)||compare(a.id,b.id));
 blocked.sort((a,b)=>compare(a.task.id,b.task.id));
 return {actions:ready.slice(0,3).map(task=>{
  const directUnlocks=direct(task.id),date=task.due_date;
  const reason=!date?'No due date recorded.':date<today?`Overdue since ${displayDate(date)}.`:date===today?'Due today.':`Due ${displayDate(date)}.`;
  return {task,directUnlocks,reason:`${reason} Prerequisite ${task.prerequisite_task_id?'completed':'not required'}.${directUnlocks?` Direct prerequisite for ${directUnlocks} incomplete ${directUnlocks===1?'task':'tasks'}.`:''}`};
 }),blocked,empty:ready.length?null:blocked.length?'No ready tasks. Review the unmet prerequisites below.':'No actionable tasks.'};
}
export type FinancialDueItem={id:string;title:string;payment_due_date:string|null;archived_at:string|null};
export function financialDueItems(items:readonly FinancialDueItem[]) {
 return items.filter(item=>!item.archived_at&&item.payment_due_date!==null).map(item=>{calendarDate(item.payment_due_date);return item;}).sort((a,b)=>compare(a.payment_due_date!,b.payment_due_date!)||compare(a.id,b.id));
}

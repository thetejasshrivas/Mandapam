import type {DraftTask} from '../domain/create.ts';
import {filterTasks,readiness} from '../domain/tasks.ts';
export type MemberLabel={id:string;label:string};
export type RosterState='loading'|'ready'|'unavailable';
export function assigneeLabel(task:Pick<DraftTask,'assigned_member_id'>,members:MemberLabel[],state:RosterState){if(!task.assigned_member_id)return 'Unassigned';return members.find(m=>m.id===task.assigned_member_id)?.label??(state==='ready'?'Previous Member · '+task.assigned_member_id.slice(-8)+' (not active)':'Assigned Member · '+task.assigned_member_id.slice(-8)+(state==='loading'?' (name loading)':' (name unavailable)'));}
export type TaskFilters={assignee?:string;owner?:string;ceremony?:string;status?:string;due?:string;search?:string};
export function taskView(tasks:DraftTask[],filters:TaskFilters,today:string,members:MemberLabel[]=[]){
 const query=filters.search?.trim().toLocaleLowerCase()??'';
 return filterTasks(tasks,filters.owner??'',filters.ceremony==='shared'?'':filters.ceremony??'').filter(t=>
  (!filters.assignee||(filters.assignee==='unassigned'?!t.assigned_member_id:t.assigned_member_id===filters.assignee))&&
  (filters.ceremony!=='shared'||t.ceremony_id===null)&&(!filters.status||t.status===filters.status)&&
  (!query||[t.title,t.owner_name??'',members.find(m=>m.id===t.assigned_member_id)?.label??'',t.description??''].some(text=>text.toLocaleLowerCase().includes(query)))&&
  (!filters.due||filters.due==='undated'&&!t.due_date||filters.due==='today'&&t.due_date===today||filters.due==='overdue'&&!!t.due_date&&t.due_date<today||filters.due==='upcoming'&&!!t.due_date&&t.due_date>today));
}
export function taskSummary(tasks:DraftTask[]){const retained=filterTasks(tasks,'','');return{total:retained.length,inProgress:retained.filter(t=>t.status==='IN_PROGRESS').length,blocked:retained.filter(t=>readiness(t,tasks).blocked).length,completed:retained.filter(t=>t.status==='COMPLETED').length,deferred:retained.filter(t=>t.status==='DEFERRED').length};}
export function taskSupport(tasks:DraftTask[],today:string){
 const incomplete=filterTasks(tasks,'','').filter(t=>t.status!=='COMPLETED');
 const owners=new Map<string,number>();for(const t of incomplete){const name=t.owner_name??'Not recorded';owners.set(name,(owners.get(name)??0)+1);}
 return{upcoming:incomplete.filter(t=>t.status!=='DEFERRED'&&t.due_date&&t.due_date>=today).sort((a,b)=>a.due_date!.localeCompare(b.due_date!)||a.id.localeCompare(b.id)).slice(0,4),blocked:incomplete.filter(t=>readiness(t,tasks).blocked),owners:[...owners].map(([name,count])=>({name,count}))};
}

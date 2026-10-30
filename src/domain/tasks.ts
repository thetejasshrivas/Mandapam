import {calendarDate,type DraftTask} from './create.ts';
export const statuses=['TO_DO','IN_PROGRESS','COMPLETED','DEFERRED'] as const;
export type TaskStatus=typeof statuses[number];
export function allowedTransitions(status:string):TaskStatus[] {
 switch(status){case 'TO_DO':return ['IN_PROGRESS','COMPLETED','DEFERRED'];case 'IN_PROGRESS':return ['TO_DO','COMPLETED','DEFERRED'];case 'DEFERRED':return ['TO_DO'];case 'COMPLETED':return ['TO_DO','IN_PROGRESS'];default:return [];}
}
export function readiness(task:DraftTask,tasks:DraftTask[]) {
 if(task.archived_at||task.dismissed_at||!['TO_DO','IN_PROGRESS'].includes(task.status))return {ready:false,blocked:false,reason:''};
 if(!task.prerequisite_task_id)return {ready:true,blocked:false,reason:''};
 const parent=tasks.find(t=>t.id===task.prerequisite_task_id);
 if(parent&&!parent.archived_at&&!parent.dismissed_at&&parent.status==='COMPLETED')return {ready:true,blocked:false,reason:''};
 return {ready:false,blocked:true,reason:parent?.status==='DEFERRED'?'Prerequisite deferred — review the dependency':!parent||parent.archived_at||parent.dismissed_at?'Prerequisite unavailable — review the dependency':`Waiting for prerequisite: ${parent.title}`};
}
export function dependencyValid(taskId:string,parentId:string|null,tasks:DraftTask[],limit=64):boolean {
 const seen=new Set([taskId]);let steps=0;
 while(parentId){if(++steps>limit||seen.has(parentId))return false;seen.add(parentId);const parent=tasks.find(t=>t.id===parentId);if(!parent)return false;parentId=parent.prerequisite_task_id;}
 return true;
}
export function filterTasks(tasks:DraftTask[],owner:string,ceremony:string) {return tasks.filter(t=>!t.archived_at&&!t.dismissed_at&&(!owner||t.owner_name===owner)&&(!ceremony||t.ceremony_id===ceremony));}
function optional(value:unknown,max:number) {if(value==null||value==='')return null;if(typeof value!=='string'||value.trim().length>max)throw Error('Use bounded text.');return value.trim()||null;}
function flag(value:unknown) {if(value==null||value==='')return false;if(value!=='on')throw Error('Use explicit confirmation.');return true;}
export function parseTaskUpdate(input:unknown):{operation:'status'|'details'|'archive'|'add';changes:Record<string,unknown>;confirmed:boolean;override:boolean} {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid task update.');
 const fields=input as Record<string,unknown>,operation=fields.operation;
 const keys=operation==='status'?['operation','status','confirmed_by','confirmed','override']:operation==='details'?['operation','title','owner_name','due_date']:operation==='add'?['operation','title','owner_name','due_date','ceremony_id']:operation==='archive'?['operation','confirmed']:[];
 if(!keys.length||Object.keys(fields).some(key=>!keys.includes(key)))throw Error('Unsupported task field.');
 if(operation==='status'){
  if(typeof fields.status!=='string'||!statuses.includes(fields.status as TaskStatus))throw Error('Choose a supported task status.');
  return {operation,changes:{status:fields.status,confirmed_by:optional(fields.confirmed_by,100)},confirmed:flag(fields.confirmed),override:flag(fields.override)};
 }
 if(operation==='archive')return {operation,changes:{},confirmed:flag(fields.confirmed),override:false};
 const title=optional(fields.title,160);if(!title)throw Error('Task title is required.');
 const changes:Record<string,unknown>={title};
 if('owner_name' in fields)changes.owner_name=optional(fields.owner_name,100);
 if('due_date' in fields)changes.due_date=calendarDate(fields.due_date)||null;
 if(operation==='add') {
  const ceremony=optional(fields.ceremony_id,36);if(ceremony&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ceremony))throw Error('Invalid ceremony.');
  changes.ceremony_id=ceremony;
 }
 return {operation:operation==='add'?'add':'details',changes,confirmed:false,override:false};
}

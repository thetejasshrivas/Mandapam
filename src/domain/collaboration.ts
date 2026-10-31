import {parseVersion} from './create.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseCollaboration(input:unknown):{operation:'assign'|'contribute';args:Record<string,unknown>}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid task request.');
 const row=input as Record<string,unknown>,operation=row.operation;
 const allowed=operation==='assign'?['operation','task_id','version','assignee_id']:operation==='contribute'?['operation','task_id','version','status','note','confirmed']:[];
 if(!allowed.length||Object.keys(row).some(k=>!allowed.includes(k))||typeof row.task_id!=='string'||!uuid.test(row.task_id))throw Error('Unsupported task fields.');
 const args:Record<string,unknown>={p_task:row.task_id,p_version:parseVersion(row.version)};
 if(operation==='assign'){
  if(row.assignee_id!==null&&(typeof row.assignee_id!=='string'||!uuid.test(row.assignee_id)))throw Error('Choose an active Member account.');
  return{operation,args:{...args,p_member:row.assignee_id}};
 }
 if(typeof row.status!=='string'||!['TO_DO','IN_PROGRESS','COMPLETED','DEFERRED'].includes(row.status)||typeof row.note!=='string'||row.note.length>500||typeof row.confirmed!=='boolean')throw Error('Use a supported status and a note up to 500 characters.');
 return{operation:'contribute',args:{...args,p_status:row.status,p_note:row.note.trim(),p_confirm:row.confirmed}};
}

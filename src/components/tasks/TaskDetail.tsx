import type {FormEvent} from 'react';
import {displayDate,type Draft,type DraftTask} from '@/domain/create';
import {readiness} from '@/domain/tasks';
import {assigneeLabel,type MemberLabel,type RosterState} from '@/presentation/tasks';
import TaskAssignment from './TaskAssignment';
import {rankActions,istDate} from '@/domain/priorities';
type Props={members?:MemberLabel[];rosterState?:RosterState;task:DraftTask;data:Draft;pending:boolean;locked:boolean;mark:(id:string)=>void;cancel:(id:string)=>void;submit:(event:FormEvent<HTMLFormElement>,task:DraftTask|null,operation:string)=>void;status:(task:DraftTask,next:string)=>void;archive:(task:DraftTask)=>void};
export function timestamp(value?:string|null){return value?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' IST':'Not recorded';}
export default function TaskDetail({task,data,pending,locked,mark,cancel,submit,status,archive,members=[],rosterState='loading'}:Props){
 const state=readiness(task,data.tasks),parent=data.tasks.find(t=>t.id===task.prerequisite_task_id),dependents=data.tasks.filter(t=>t.prerequisite_task_id===task.id&&!t.dismissed_at);
 const editId=`active-edit-${task.id}`,confirmId=`status-note-${task.id}`;
 const reason=rankActions(data.tasks,istDate(new Date())).actions.find(a=>a.task.id===task.id)?.reason;
 return <div className="tp-detail-body" data-task-id={task.id}>
  <div className="tp-detail-facts"><span className="tp-ceremony">{data.ceremonies.find(c=>c.id===task.ceremony_id)?.title??'Shared preparation'}</span><span>Assigned to: {assigneeLabel(task,members,rosterState)}</span>{task.owner_name&&<span>Offline contact: {task.owner_name}</span>}<span className={`tp-status status-${task.status.toLowerCase()}`} data-task-status>{task.status.replaceAll('_',' ')}</span></div>
  <p className="tp-due">Due date: <strong>{displayDate(task.due_date)}</strong></p>
  {task.description&&<p className="tp-description">{task.description}</p>}
  <section className={state.blocked?'tp-dependency tp-warning':'tp-dependency'}><h3>Prerequisite</h3><p>{parent?`${parent.title} · ${parent.archived_at?'Archived':parent.dismissed_at?'Dismissed':parent.status.replaceAll('_',' ')}`:task.prerequisite_task_id?'Prerequisite unavailable':'No prerequisite recorded.'}</p>{state.blocked&&<p data-readiness="blocked">Blocked · {state.reason}. Completion requires a deliberate out-of-order override; it does not finish the prerequisite.</p>}</section>
  {reason&&<p className="tp-ranking"><strong>Why this is next</strong><br/>{reason}</p>}
  <TaskAssignment members={members} rosterState={rosterState} key={task.id+':'+data.wedding.state_version} task={task} weddingId={data.wedding.id} version={data.wedding.state_version} pending={pending} mark={mark} cancel={cancel}/>
  <div className="tp-quick-actions" aria-label={`Update ${task.title}`}>
   {task.status==='TO_DO'&&<button className="tp-primary" disabled={locked} onClick={()=>status(task,'IN_PROGRESS')}>Start task</button>}
   {['TO_DO','IN_PROGRESS'].includes(task.status)&&<><button className="tp-success" disabled={locked} onClick={()=>status(task,'COMPLETED')}>{state.blocked?'Complete out of order…':'Mark complete'}</button><button disabled={locked} onClick={()=>status(task,'DEFERRED')}>Defer</button></>}
   {task.status==='IN_PROGRESS'&&<button disabled={locked} onClick={()=>status(task,'TO_DO')}>Return to do</button>}
   {task.status==='DEFERRED'&&<button className="tp-primary" disabled={locked} onClick={()=>status(task,'TO_DO')}>Resume task</button>}
   {task.status==='COMPLETED'&&<button disabled={locked} onClick={()=>status(task,'TO_DO')}>Reopen task…</button>}
  </div>
  <form key={`${task.id}:${task.updated_at}`} id={editId} onChangeCapture={()=>mark(editId)} onSubmit={event=>submit(event,task,'details')}><fieldset disabled={pending}><legend>Edit task details</legend><label htmlFor={`${editId}-title`}>Task title</label><input id={`${editId}-title`} name="title" maxLength={160} required defaultValue={task.title}/><label htmlFor={`${editId}-owner`}>Offline owner name (optional)</label><input id={`${editId}-owner`} name="owner_name" maxLength={100} defaultValue={task.owner_name??''}/><label htmlFor={`${editId}-due`}>Due date (optional)</label><input id={`${editId}-due`} name="due_date" type="date" disabled={task.status==='COMPLETED'} defaultValue={task.due_date??''}/>{task.status==='COMPLETED'&&<small>Reopen deliberately before changing the completed task’s date.</small>}<div className="tp-form-actions"><button className="tp-primary">Save task details</button><button type="button" onClick={()=>cancel(editId)}>Cancel task edits</button></div></fieldset></form>
  <details className="tp-confirmation"><summary>Record separate status confirmation</summary><form key={`${task.id}:${task.updated_at}`} id={confirmId} onChangeCapture={()=>mark(confirmId)} onSubmit={event=>submit(event,task,'status')}><fieldset disabled={pending}><legend className="visually-hidden">Status confirmation</legend><input type="hidden" name="status" value={task.status}/><label htmlFor={`${confirmId}-by`}>Confirmed by (descriptor)</label><input id={`${confirmId}-by`} name="confirmed_by" required maxLength={100} defaultValue={task.status_confirmed_by??''}/><small>Enter only a confirmation separately reported to you. Selecting an owner does not confirm their status.</small><div className="tp-form-actions"><button>Save confirmation</button><button type="button" onClick={()=>cancel(confirmId)}>Cancel confirmation</button></div></fieldset></form></details>
  <dl className="tp-history"><div><dt>Last updated</dt><dd>{timestamp(task.updated_at)}</dd></div>{task.status==='COMPLETED'&&<div><dt>Completed</dt><dd>{timestamp(task.completed_at)}</dd></div>}{task.status_confirmed_at&&<div><dt>Separately confirmed</dt><dd>{task.status_confirmed_by} · {timestamp(task.status_confirmed_at)}</dd></div>}</dl>
  {task.status!=='COMPLETED'&&(dependents.length?<p className="tp-footnote">Archive unavailable: retained dependents need this task. Defer it if necessary.</p>:<button className="tp-archive" disabled={locked} onClick={()=>archive(task)}>Archive task…</button>)}
 </div>;
}

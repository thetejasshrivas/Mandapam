'use client';
import {useEffect,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {displayDate,type Draft} from '@/domain/create';
import {rankActions,istDate,financialDueItems,type FinancialDueItem} from '@/domain/priorities';
export default function NextActions({data,today:initialToday,obligations=null}:{data:Draft;today:string;obligations?:FinancialDueItem[]|null}) {
 const [today,setToday]=useState(initialToday),[pending,startTransition]=useTransition(),router=useRouter();
 useEffect(()=>{const update=()=>setToday(istDate(new Date()));update();const timer=setInterval(update,30000);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};},[]);
 let ranked:ReturnType<typeof rankActions>;
 try{ranked=rankActions(data.tasks,today);}catch{return <section className="draft-section"><h2>Next actions unavailable</h2><p>Reload to check your saved task data.</p></section>;}
 const dues=obligations===null?null:financialDueItems(obligations);
 return <section className="draft-section next-actions" id="next-actions" tabIndex={-1} aria-labelledby="next-actions-heading">
  <div className="next-actions-heading"><h2 id="next-actions-heading">Your next actions</h2><button type="button" className="draft-secondary" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}>{pending?'Refreshing…':'Refresh actions'}</button></div>
  <p>Up to three ready tasks from your saved plan. Dates follow Asia/Kolkata.</p>
  {ranked.empty&&<p role="status">{ranked.empty}</p>}
  <ol className="action-list">{ranked.actions.map(({task,reason},index)=><li className="action-item" key={task.id} data-next-action={task.id}>
   <span className="priority-order" aria-hidden="true">{index+1}</span>
   <div className="task-meta"><span>{data.ceremonies.find(c=>c.id===task.ceremony_id)?.title??'Shared preparation'}</span><span>{displayDate(task.due_date)}</span></div>
   <h3><a href={`#task-${task.id}`}>{task.title}</a></h3><div className="task-footer"><span>Owner: {task.owner_name??'Not recorded'}</span><span>{task.status.replaceAll('_',' ')}</span></div>
   <details className="task-reason"><summary>Why this is next</summary><p>{reason}</p></details>
  </li>)}</ol>
  {ranked.blocked.length>0&&<aside className="blocked-note" aria-labelledby="blocked-work-heading"><div><h3 id="blocked-work-heading">Blocked work ({ranked.blocked.length})</h3><details><summary>Review unmet prerequisites</summary><ul>{ranked.blocked.map(({task,reason})=><li key={task.id}><strong>{task.title}</strong> — {reason}</li>)}</ul></details></div></aside>}
  <aside className="next-obligations" aria-labelledby="obligations-heading"><h3 id="obligations-heading">Recorded financial due items</h3>{dues===null?<p>Payment due-date recording is not available in the current register. No vendor deadlines are inferred.</p>:dues.length?<ul>{dues.map(item=><li key={item.id}>{item.title} · {displayDate(item.payment_due_date)}</li>)}</ul>:<p>No payment due dates recorded.</p>}</aside>
 </section>;
}

'use client';
import {useEffect,useRef,useState,useTransition,type FormEvent,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {ceremonyCatalog,displayDate,toRupees,type Ceremony,type Draft,type DraftTask} from '@/domain/create';
import ActiveTasks from '@/components/tasks/ActiveTasks';
import NextActions from '@/components/tasks/NextActions';
import AiSuggestions from '@/components/create/AiSuggestions';
type Row={key:string;id:string|null;title:string;date:string;guest_count:string;selected:boolean};
function rowsFrom(ceremonies:Ceremony[]):Row[] {
  const used=new Set<string>();
  const rows:Row[]=ceremonyCatalog.map(option=>{
    const existing=ceremonies.find(c=>c.title===option.title&&!c.is_archived)??ceremonies.find(c=>c.title===option.title);
    if(existing)used.add(existing.id);
    return {key:option.key,id:existing?.id??null,title:existing?.title??option.title,date:existing?.ceremony_date??'',guest_count:existing?.guest_count?.toString()??'',selected:!!existing&&!existing.is_archived};
  });
  ceremonies.filter(c=>!used.has(c.id)).forEach((c,index)=>rows.push({key:`custom-${index}`,id:c.id,title:c.title,date:c.ceremony_date??'',guest_count:c.guest_count?.toString()??'',selected:!c.is_archived}));
  return rows;
}
function DraftForm({id,operation,children,submit,mark,disabled,track=false}:{id:string;operation:string;children:ReactNode;submit:(event:FormEvent<HTMLFormElement>,operation:string,id:string)=>Promise<void>;mark:(id:string)=>void;disabled:boolean;track?:boolean}) {
  return <form id={id} data-operation={operation} onChangeCapture={()=>{if(track)mark(id);}} onSubmit={event=>void submit(event,operation,id)}><fieldset className="draft-form-fields" disabled={disabled}><legend className="visually-hidden">{operation} draft</legend>{children}</fieldset></form>;
}
function TaskInputs({task,prefix}:{task?:DraftTask;prefix:string}) {return <>
  <label htmlFor={`${prefix}-title`}>Task title</label><input id={`${prefix}-title`} name="title" required maxLength={160} defaultValue={task?.title??''}/>
  <label htmlFor={`${prefix}-due`}>Due date (optional)</label><input id={`${prefix}-due`} name="due_date" type="date" defaultValue={task?.due_date??''}/>
  <label htmlFor={`${prefix}-owner`}>Owner name (optional)</label><input id={`${prefix}-owner`} name="owner_name" maxLength={100} defaultValue={task?.owner_name??''}/>
  <label htmlFor={`${prefix}-notes`}>Private notes (optional)</label><textarea id={`${prefix}-notes`} name="description" maxLength={1000} defaultValue={task?.description??''}/>
 </>;}
export default function DraftWorkspace({data,today}:{data:Draft;today:string}) {
  const router=useRouter();const [refreshing,startTransition]=useTransition();
  const [rowDraft,setRows]=useState(()=>rowsFrom(data.ceremonies));
  const [dirty,setDirty]=useState<Set<string>>(new Set());const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState<{error:boolean;text:string}|null>(null);const noticeRef=useRef<HTMLDivElement>(null);
  const w=data.wedding,active=w.state==='ACTIVE',pending=busy!==null||refreshing;
  const rows=dirty.has('setup')?rowDraft:rowsFrom(data.ceremonies);
  const selected=rows.filter(row=>row.selected),liveCeremonies=data.ceremonies.filter(c=>!c.is_archived);
  const retained=data.tasks.filter(task=>!task.dismissed_at&&!task.archived_at);
  const dismissed=data.tasks.filter(task=>task.dismissed_at);
  useEffect(()=>{if(notice?.error)noticeRef.current?.focus();},[notice]);
  const mark=(id:string)=>{if(id==='setup'&&!dirty.has('setup'))setRows(rowsFrom(data.ceremonies));setDirty(previous=>new Set(previous).add(id));};
  const clean=(id:string)=>setDirty(previous=>{const next=new Set(previous);next.delete(id);return next;});
  const setRow=(key:string,values:Partial<Row>)=>setRows(previous=>(dirty.has('setup')?previous:rowsFrom(data.ceremonies)).map(row=>row.key===key?{...row,...values}:row));
  const cancel=(id:string)=>{(document.getElementById(id) as HTMLFormElement|null)?.reset();clean(id);if(id==='setup')setRows(rowsFrom(data.ceremonies));};
  async function submit(event:FormEvent<HTMLFormElement>,operation:string,id:string) {
    event.preventDefault();if(pending)return;
    const form=event.currentTarget;const fields=Object.fromEntries(new FormData(form));
    // Native date entry/restore can update a control before React's mirror receives a change event.
    // Submit the visible calendar value, keeping the existing validated ceremony DTO and IDs.
    if(operation==='setup')fields.ceremonies=JSON.stringify(selected.map(row=>({id:row.id,title:row.title,date:(form.elements.namedItem(`ceremony-${row.key}-date`) as HTMLInputElement|null)?.value??row.date,guest_count:row.guest_count})));
    setBusy(operation);setNotice(null);
    try {
      const response=await fetch(`/api/weddings/${w.id}/draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,version:w.state_version,fields})});
      const result=await response.json();
      if(!response.ok) {setNotice({error:true,text:result.error?.message??'The save could not be confirmed. Reload before retrying.'});return;}
      clean(id);if(operation==='add')form.reset();
      setNotice({error:false,text:operation==='activate'?'Your plan is active.':operation==='generate'?'Draft ready for review. Repeated generation does not duplicate tasks.':operation==='reopen'?'Selection reopened. Manual tasks and dismissals are preserved.':'Saved to your private draft.'});
      startTransition(()=>router.refresh());
    }catch{setNotice({error:true,text:'The save outcome is unknown. Reload to check your saved draft before retrying.'});}
    finally{setBusy(null);}
  }
  const formProps={submit,mark,disabled:pending};
  return <main className="draft-shell">
    <p className="draft-eyebrow">{active?'Active plan':'Private draft · Setup, review, activate'}</p><h1>{active?w.title:'Make room for your celebration'}</h1>
    {notice&&<div className={notice.error?'draft-notice draft-error':'draft-notice'} ref={noticeRef} tabIndex={-1} role={notice.error?'alert':'status'}>{notice.text}</div>}
    {active&&<NextActions data={data} today={today}/>}
    {active?<section id="ceremonies" tabIndex={-1} className="draft-section" aria-labelledby="active-heading"><h2 id="active-heading">Your saved wedding</h2><dl className="draft-facts"><div><dt>City</dt><dd>{w.city}</dd></div><div><dt>Wedding date</dt><dd>{w.is_tentative?'Tentative · ':''}{displayDate(w.wedding_date)}</dd></div><div><dt>Budget ceiling</dt><dd>{w.budget_ceiling_paise===null?'Not recorded':`INR ${toRupees(w.budget_ceiling_paise)}`}</dd></div></dl><p className="draft-warning">Date replanning is not supported in this version; existing tasks and commitments will not move automatically.</p><h3>Ceremonies</h3><ul className="draft-ceremony-summary">{liveCeremonies.map(c=><li key={c.id}><strong>{c.title}</strong><span>{displayDate(c.ceremony_date)} · Guests: {c.guest_count??'Unknown'}</span></li>)}</ul><p>Active guest counts are protected. Changes require an ADAPT proposal.</p></section>:<>
      <p className="draft-intro">Choose only the ceremonies that fit. Starter tasks are optional preparation notes, ready for you to edit.</p>
      {dirty.size>0&&<p className="draft-warning" role="status">Save or cancel unsaved changes before generating, rebuilding or activating.</p>}
      <section id="ceremonies" tabIndex={-1} className="draft-section" aria-labelledby="setup-heading"><h2 id="setup-heading">1. Your wedding</h2>
        <DraftForm {...formProps} id="setup" operation="setup" track>
          <div className="draft-grid"><div className="draft-fields"><label htmlFor="wedding-title">Wedding title</label><input id="wedding-title" name="title" maxLength={100} required defaultValue={w.title}/><label htmlFor="wedding-city">City</label><input id="wedding-city" name="city" maxLength={100} required defaultValue={w.city}/></div><div className="draft-fields"><label htmlFor="wedding-date">Wedding date (optional while tentative)</label><input id="wedding-date" name="wedding_date" type="date" defaultValue={w.wedding_date??''}/><label className="draft-check"><input type="checkbox" name="is_tentative" defaultChecked={w.is_tentative}/>Date is tentative or not yet set</label><label htmlFor="wedding-budget">Budget ceiling (INR, optional)</label><input id="wedding-budget" name="budget" inputMode="decimal" maxLength={32} defaultValue={toRupees(w.budget_ceiling_paise)} aria-describedby="budget-help"/><small id="budget-help">Blank means not recorded. Zero is an explicit zero; no prices are estimated.</small></div></div>
          <h3>Choose your ceremonies</h3><p>{w.draft_locked?'Selection is locked after generation. Use Rebuild draft to change it. Dates and counts remain editable in this draft.':'Select one to twelve. No ritual is required; custom names are welcome.'}</p>
          <input type="hidden" name="ceremonies" value={JSON.stringify(selected.map(row=>({id:row.id,title:row.title,date:row.date,guest_count:row.guest_count})))}/>
          <div className="draft-choices">{rows.map(row=><fieldset key={row.key} className="draft-ceremony" data-catalog={row.key}><legend><label className="draft-check"><input type="checkbox" checked={row.selected} disabled={w.draft_locked||(!row.selected&&selected.length>=12)} onChange={event=>setRow(row.key,{selected:event.target.checked})}/>{ceremonyCatalog.find(c=>c.key===row.key)?.title??(row.title||'Custom ceremony')}</label></legend>{row.selected&&<div className="draft-fields"><label htmlFor={`ceremony-${row.key}-name`}>Ceremony name</label><input id={`ceremony-${row.key}-name`} value={row.title} required maxLength={80} onChange={event=>setRow(row.key,{title:event.target.value})}/><label htmlFor={`ceremony-${row.key}-date`}>Ceremony date (optional)</label><input id={`ceremony-${row.key}-date`} type="date" value={row.date} onChange={event=>setRow(row.key,{date:event.target.value})}/><label htmlFor={`ceremony-${row.key}-guests`}>Guest count (optional)</label><input id={`ceremony-${row.key}-guests`} type="number" min={1} max={10000} step={1} value={row.guest_count} onChange={event=>setRow(row.key,{guest_count:event.target.value})}/><small>Blank stays unknown; no headcount ratio is assumed.</small></div>}</fieldset>)}</div>
          {!w.draft_locked&&<button className="draft-secondary" type="button" disabled={selected.length>=12} onClick={()=>{mark('setup');setRows(previous=>{const current=dirty.has('setup')?previous:rowsFrom(data.ceremonies);return [...current,{key:`custom-new-${current.length}`,id:null,title:'',date:'',guest_count:'',selected:true}];});}}>Add custom ceremony</button>}
          <div className="draft-buttons"><button className="draft-primary" type="submit">{busy==='setup'?'Saving…':'Save setup'}</button><button className="draft-secondary" type="button" onClick={()=>cancel('setup')}>Cancel unsaved setup changes</button></div>
        </DraftForm>
      </section>
      <section className="draft-section" aria-labelledby="generation-heading"><h2 id="generation-heading">2. Prepare your draft</h2><p>Six shared tasks plus three per selected ceremony. Due dates start blank; enter dates that match your actual arrangements.</p><details className="draft-explanation"><summary>Template assumptions and dependencies</summary><p>No vendor rates, availability, mandatory rituals or date offsets are inferred. The only starter dependency is invitation wording → review → sending. Your edits and dismissals are retained on repeat generation.</p></details>
        {!w.draft_locked?<DraftForm {...formProps} id="generate" operation="generate"><button className="draft-primary" disabled={dirty.size>0||liveCeremonies.length===0}>Generate draft</button></DraftForm>:<details className="draft-explanation"><summary>Rebuild draft to change ceremony selection</summary><p>Existing edits, manual tasks and dismissed identities are kept. Tasks for removed ceremonies are dismissed, not deleted. Retained manual work or financial history can prevent removal; dismiss manual tasks first or keep that ceremony.</p><DraftForm {...formProps} id="reopen" operation="reopen"><label className="draft-check"><input name="confirmed" type="checkbox" required/>I want to reopen ceremony selection.</label><label className="draft-check"><input name="keep_manual" type="checkbox" required/>Keep all manually added tasks and prior dismissals.</label><button className="draft-secondary" disabled={dirty.size>0}>Rebuild draft</button></DraftForm></details>}
      </section>
    </>}
    {active?<ActiveTasks data={data}/>:<section id="tasks" tabIndex={-1} className="draft-section" aria-labelledby="review-heading"><h2 id="review-heading">3. Review your tasks <span className="draft-count">({retained.length})</span></h2>
      {!retained.length&&<p className={w.draft_locked?'draft-warning':''}>{!active&&!w.draft_locked?'Save your selection and generate a draft to start reviewing.':'No tasks are retained. Add a manual task before activation, or explicitly review the empty plan.'}</p>}
      <ol className="draft-task-list">{retained.map(task=>{
        const dependent=retained.filter(t=>t.prerequisite_task_id===task.id);
        const prerequisite=data.tasks.find(t=>t.id===task.prerequisite_task_id);
        return <li key={task.id} data-task-id={task.id} data-template-key={task.template_key??'manual'}><p className="draft-task-meta">{task.ceremony_id?data.ceremonies.find(c=>c.id===task.ceremony_id)?.title:'Shared preparation'} · {task.status.replaceAll('_',' ')}</p><h3>{task.title}</h3><p>{displayDate(task.due_date)} · Owner: {task.owner_name??'Not recorded'}</p>{prerequisite&&<p className="draft-task-meta">Prerequisite: {prerequisite.title}</p>}
          {!active&&<><details className="draft-explanation"><summary>Edit task</summary><DraftForm {...formProps} id={`edit-${task.id}`} operation="edit" track><input type="hidden" name="task_id" value={task.id}/><div className="draft-fields"><TaskInputs task={task} prefix={`edit-${task.id}`}/></div><div className="draft-buttons"><button className="draft-primary">Save task</button><button type="button" className="draft-secondary" onClick={()=>cancel(`edit-${task.id}`)}>Cancel task changes</button></div></DraftForm></details><DraftForm {...formProps} id={`dismiss-${task.id}`} operation="dismiss"><input type="hidden" name="task_id" value={task.id}/><button className="draft-secondary" disabled={dirty.size>0||dependent.length>0}>Dismiss task</button></DraftForm>{dependent.length>0&&<p className="draft-task-meta">Keep this prerequisite until these dependents are dismissed: {dependent.map(t=>t.title).join(', ')}.</p>}</>}
        </li>;
      })}</ol>
      {dismissed.length>0&&<details className="draft-explanation"><summary>Dismissed tasks ({dismissed.length})</summary><p>Saved titles and template identities remain available for future suggestion deduplication. They are not restored by regeneration.</p><ul>{dismissed.map(task=><li key={task.id}>{task.title}</li>)}</ul></details>}
      {!active&&<details className="draft-explanation"><summary>Add a manual task</summary><DraftForm {...formProps} id="manual-add" operation="add" track><div className="draft-fields"><TaskInputs prefix="manual"/><label htmlFor="manual-ceremony">Ceremony</label><select id="manual-ceremony" name="ceremony_id"><option value="">Shared preparation</option>{liveCeremonies.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><small>Owner names are your planning notes, not a confirmation from that person.</small></div><div className="draft-buttons"><button className="draft-primary">Add task</button><button type="button" className="draft-secondary" onClick={()=>cancel('manual-add')}>Cancel new task</button></div></DraftForm></details>}
    </section>}
    {!active&&w.draft_locked&&<AiSuggestions weddingId={w.id} ceremonies={liveCeremonies} disabled={pending||dirty.size>0}/>}
    {!active&&<section className="draft-section draft-activation" aria-labelledby="activate-heading"><h2 id="activate-heading">4. Activate the saved plan</h2><p>Review the saved tasks first. Activation is permanent in this version. Existing wedding and ceremony dates become read-only; future guest-count changes require ADAPT.</p>{!retained.length&&w.draft_locked&&<p className="draft-warning">This plan has no retained tasks. Add one above, or confirm that you reviewed this empty plan.</p>}<DraftForm key={w.state_version} {...formProps} id="activate" operation="activate"><label className="draft-check"><input name="confirmed" type="checkbox" required/>I reviewed the saved draft and confirm Activate Plan.</label><button className="draft-primary" disabled={dirty.size>0||!w.draft_locked}>Activate Plan</button></DraftForm></section>}
  </main>;
}

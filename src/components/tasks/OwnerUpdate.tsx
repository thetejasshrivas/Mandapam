'use client';
import {useRef,useState} from 'react';
import {ownerUpdate,type UpdateTask} from '@/domain/owner-update';
export default function OwnerUpdate({owner,tasks,disabled}:{owner:string;tasks:UpdateTask[];disabled:boolean}) {
 const [preview,setPreview]=useState<string|null>(null),[count,setCount]=useState(0),[omitted,setOmitted]=useState(0),[notice,setNotice]=useState(''),[copying,setCopying]=useState(false);
 const area=useRef<HTMLTextAreaElement>(null),tooLong=(preview?.length??0)>8000;
 function prepare(){const result=ownerUpdate(owner,tasks);setPreview(result.text);setCount(result.count);setOmitted(result.omitted);setNotice('');}
 async function copy(){
  if(!preview?.trim()||!count||disabled||copying||tooLong)return;setCopying(true);setNotice('');
  try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(preview);setNotice('Copied update. Paste it yourself wherever you choose.');}
  catch{setNotice('Clipboard unavailable. Select the preview and copy it manually.');area.current?.focus();area.current?.select();}
  finally{setCopying(false);}
 }
 return <section className="draft-explanation" aria-labelledby="owner-update-heading"><h3 id="owner-update-heading">Copy update</h3>
  <p>Choose one named owner above. Preview only their incomplete tasks in the current ceremony filter. Notes, money and other owners stay out. Deferred tasks are labelled for review.</p>
  <button type="button" className="draft-secondary" disabled={!owner||disabled||copying} onClick={prepare}>Preview update</button>
  {!owner&&<p className="draft-task-meta">Select a named owner to prepare an update.</p>}
  {preview!==null&&<><p className="draft-task-meta">{count} shareable incomplete {count===1?'task':'tasks'}.{omitted>0?` ${omitted} ${omitted===1?'title was':'titles were'} omitted because it may contain money, contact details or markup. Review those privately.`:''}</p>
   {!count?<p role="status">No shareable incomplete tasks for this owner in the current view.</p>:<div className="draft-fields"><label htmlFor="owner-update-preview">Plaintext preview — review or edit before copying</label><textarea ref={area} id="owner-update-preview" rows={8} value={preview} disabled={disabled||copying} onChange={event=>{setPreview(event.target.value);setNotice('');}} aria-describedby="owner-update-privacy"/><small id="owner-update-privacy">Only this text will be copied. Review your edits for private details. Nothing is sent automatically.</small>{tooLong&&<p role="alert">This update exceeds8000 characters. Shorten the preview or narrow the ceremony filter before copying.</p>}</div>}
   <div className="draft-buttons"><button type="button" className="draft-primary" disabled={!count||!preview.trim()||disabled||copying||tooLong} onClick={()=>void copy()}>{copying?'Copying…':'Copy update'}</button></div>
  </>}
  {notice&&<p role="status" className="draft-notice">{notice}</p>}
 </section>;
}

'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Ceremony} from '@/domain/create';
import type {Suggestion} from '@/domain/ai';
export default function AiSuggestions({weddingId,ceremonies,disabled}:{weddingId:string;ceremonies:Ceremony[];disabled:boolean}) {
 const router=useRouter();
 const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [batch,setBatch]=useState<{suggestions:Suggestion[];receipt:string}|null>(null),[decided,setDecided]=useState<number[]>([]);
 async function ask(){
  if(busy||disabled)return;setBusy(true);setBatch(null);setDecided([]);setMessage('');
  try{
   const response=await fetch('/api/ai/suggest-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wedding_id:weddingId,ceremony_ids:selected})});
   const result=await response.json();
   if(!response.ok||result.data?.source!=='LIVE_MODEL'){setMessage(response.status===429?'Suggestion limit reached. Try later.':'AI suggestions unavailable');return;}
   setBatch(result.data);if(!result.data.suggestions.length)setMessage('No new suggestions after duplicate and safety checks.');
  }catch{setMessage('AI suggestions unavailable');}finally{setBusy(false);}
 }
 async function decide(index:number,operation:'accept'|'dismiss'){
  if(!batch||busy||disabled)return;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/ai/task-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wedding_id:weddingId,receipt:batch.receipt,index,operation})});
   if(!response.ok){setMessage('Decision could not be confirmed. Reload the saved draft before retrying.');return;}
   setDecided(previous=>[...previous,index]);setMessage(operation==='accept'?'Saved as a shared draft task. Review its date and owner below.':'Dismissal saved for future duplicate checks.');router.refresh();
  }catch{setMessage('Decision outcome unknown. Reload the saved draft before retrying.');}finally{setBusy(false);}
 }
 return <section className="draft-section" aria-labelledby="ai-heading"><h2 id="ai-heading">Optional task suggestions</h2>
  <p>Choose up to three ceremonies. Only generic ceremony labels and recognised starter-task titles are sent to the model. Private names, custom titles, notes and finances stay out of the request. Free-tier input may be used by the provider to improve its products.</p>
  <fieldset disabled={busy||disabled}><legend>Ceremonies for suggestions</legend>{ceremonies.map(c=><label className="draft-check" key={c.id}><input type="checkbox" checked={selected.includes(c.id)} disabled={!selected.includes(c.id)&&selected.length>=3} onChange={e=>setSelected(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.title}</label>)}
   <button className="draft-secondary" type="button" disabled={!selected.length} onClick={()=>void ask()}>{busy?'Please wait…':'Request AI suggestions'}</button>
  </fieldset>
  {disabled&&<p className="draft-task-meta">Save or cancel draft changes before requesting or deciding.</p>}
  {message&&<p role="status" className="draft-notice">{message}</p>}
  {batch&&batch.suggestions.length>0&&<><h3>AI suggestions · review before adding</h3><p>Optional ideas, not confirmed arrangements. Nothing is added automatically.</p><ul className="draft-task-list">{batch.suggestions.map((item,index)=>!decided.includes(index)&&<li key={index}><h3>{item.title}</h3><p>{item.reason}</p><div className="draft-buttons"><button type="button" className="draft-primary" disabled={busy||disabled} onClick={()=>void decide(index,'accept')}>Add to draft</button><button type="button" className="draft-secondary" disabled={busy||disabled} onClick={()=>void decide(index,'dismiss')}>Dismiss suggestion</button></div></li>)}</ul></>}
 </section>;
}

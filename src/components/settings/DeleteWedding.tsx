'use client';
import {useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import styles from './DeleteWedding.module.css';
export default function DeleteWedding({weddingId,title,version}:{weddingId:string;title:string;version:string}){
 const router=useRouter();
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),inFlight=useRef(false);
 const [confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reloadRequired,setReloadRequired]=useState(false);
 function close(){if(inFlight.current)return;dialog.current?.close();setConfirmation('');setError('');trigger.current?.focus();}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current||reloadRequired||confirmation!==title)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/weddings/'+weddingId,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation,version})});
   const result=await response.json();
   if(response.ok&&result.data?.deleted===true){router.replace('/workspace');router.refresh();return;}
   setReloadRequired(true);
   setError(response.status===409?'This plan changed or is busy. Reload and review it before trying again.':response.status===404?'This wedding is no longer available to you. Return to your workspace.':'Deletion could not be confirmed. Return to your workspace to check its current state before trying again.');
  }catch{setReloadRequired(true);setError('Connection interrupted. Deletion could not be confirmed. Return to your workspace to check its current state before trying again.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section className={styles.panel} aria-labelledby="danger-heading"><p className={styles.eyebrow}>Danger zone</p><h2 id="danger-heading">Delete this wedding</h2><p>Permanently remove <strong>{title}</strong> and its ceremonies, tasks, budget, payments, ADAPT history and family access. This cannot be undone.</p><p className={styles.note}>Your account and Google sign-in stay active. Account-wide safety limits stay in place. You can create a new wedding afterward.</p><button ref={trigger} type="button" className={styles.danger} onClick={()=>dialog.current?.showModal()}>Delete wedding</button>
 <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-heading" aria-describedby="delete-description" onCancel={event=>{event.preventDefault();close();}}>
 <form onSubmit={submit} aria-busy={busy}><p className={styles.eyebrow}>Permanent deletion</p><h2 id="delete-heading">Delete {title}?</h2><p id="delete-description">All planning, financial records and audit history for this wedding will be removed. Family invitations and access will stop working. Your account and other weddings are kept.</p><label htmlFor="delete-confirmation">Type the exact wedding name to confirm</label><p className={styles.name}>{title}</p><input autoComplete="off" id="delete-confirmation" required maxLength={title.length} value={confirmation} disabled={busy||reloadRequired} onChange={e=>setConfirmation(e.target.value)} aria-describedby="delete-description"/>
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 {reloadRequired&&<Link prefetch={false} href="/workspace" className="mp-button-secondary" onClick={()=>router.refresh()}>Return to workspace</Link>}
 <div className={styles.actions}><button type="button" onClick={close} disabled={busy} className={styles.cancel}>Cancel</button><button type="submit" className={styles.danger} disabled={busy||reloadRequired||confirmation!==title}>{busy?'Deleting wedding…':'Permanently delete wedding'}</button></div></form>
 </dialog></section>;
}

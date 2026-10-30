'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useState,type FormEvent} from 'react';
import {uuid} from '@/server/auth/policy';
import {Button,Card,PageHeading} from '../ui/Primitives';
import {familyPost,invitationTokenFromLink,pendingInvitationKey,readPendingInvitation} from './flow';
export default function InvitationAccept({authenticated}:{authenticated:boolean}){
 const router=useRouter();
 const [token,setToken]=useState(''),[link,setLink]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function clear(){try{sessionStorage.removeItem(pendingInvitationKey);}catch{/* Storage may be disabled. */}}
 function remember(value:string){setToken(value);try{sessionStorage.setItem(pendingInvitationKey,JSON.stringify({token:value,expires_at:Date.now()+30*60*1000}));}catch{setNotice('Private tab storage is unavailable. After signing in, reopen the original invitation link.');}}
 useEffect(()=>{
  const frame=requestAnimationFrame(()=>{
  const fragment=window.location.hash;
  if(fragment){const found=invitationTokenFromLink(window.location.href,window.location.origin);if(found)remember(found);else{clear();setError('This invitation link is invalid. Ask the organizer for a fresh link.');}window.history.replaceState(null,'','/family/accept');}
  else{try{const stored=readPendingInvitation(sessionStorage.getItem(pendingInvitationKey));if(stored)setToken(stored);else clear();}catch{/* Manual paste remains available. */}}
  setReady(true);
  });return()=>cancelAnimationFrame(frame);
 },[]);
 function paste(event:FormEvent){event.preventDefault();const found=invitationTokenFromLink(link.trim(),window.location.origin);if(!found){setError('Use a private Mandapam invitation link from this application.');return;}remember(found);setLink('');setError('');}
 async function accept(){setBusy(true);setError('');try{const data=await familyPost('/api/invitations/accept',{token});if(typeof data.wedding_id!=='string'||!uuid.test(data.wedding_id))throw Error('Acceptance could not be confirmed. Ask the organizer before trying again.');clear();setToken('');router.replace('/workspace/'+data.wedding_id);}catch(e){setError(e instanceof Error?e.message:'Acceptance unavailable.');setBusy(false);}}
 function cancel(){clear();setToken('');setLink('');setError('');setNotice('Cancelled on this device. No invitation was accepted or revoked.');}
 return <main className="family-workspace family-personal"><PageHeading description="Join only when you are ready.">Wedding invitation</PageHeading><Card>
  <p>Invitations are bound to the account that generated the Family Connect Code. No wedding details are disclosed before acceptance.</p><p>Members can view planning, ceremonies and tasks. Members cannot edit, view finances or access ADAPT.</p>
  {!ready?<p role="status">Preparing your invitation…</p>:!token?<><p>Open the private link from your organizer, or paste it below. A pending invitation is kept in this tab for up to 30 minutes while you sign in.</p><form onSubmit={paste} className="family-form"><label htmlFor="invitation-link">Invitation link</label><textarea id="invitation-link" value={link} onChange={e=>setLink(e.target.value)} maxLength={1024} required autoComplete="off" spellCheck={false}/><Button>Continue to invitation</Button></form></>:<><p>{authenticated?'Check that you are using the same account that generated your Connect Code. Acceptance is your explicit agreement to join.':'Sign in with the same account that generated your Connect Code, then return here to accept. Your invitation is not accepted automatically.'}</p><div className="family-actions">{authenticated?<Button type="button" disabled={busy} onClick={accept}>{busy?'Accepting…':'Accept invitation'}</Button>:<a className="family-link" href="/login?next=%2Ffamily%2Faccept">Sign in to continue</a>}<Button type="button" variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button></div>{authenticated&&<a className="family-link" href="/login?next=%2Ffamily%2Faccept">Sign in with the intended account</a>}</>}
  <p role="status" aria-live="polite">{notice}</p>{error&&<p role="alert" className="family-error">{error}</p>}
  <Link className="family-link" prefetch={false} href="/family/connect">Return to Family Connect</Link>
 </Card></main>;
}

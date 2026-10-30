'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Button,Card,PageHeading} from '../ui/Primitives';
import {copyFamilyValue,credentialPattern,displayExpiry,familyPost} from './flow';
export default function FamilyConnect(){
 const [issued,setIssued]=useState<{code:string;expires_at:string}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 async function generate(){setBusy(true);setError('');setNotice('');try{const data=await familyPost('/api/family/connect-code',{operation:'generate'});if(typeof data.code!=='string'||!credentialPattern.test(data.code)||typeof data.expires_at!=='string')throw Error('The code could not be confirmed. Please try again.');setIssued({code:data.code,expires_at:data.expires_at});}catch(e){setError(e instanceof Error?e.message:'Code unavailable.');}finally{setBusy(false);}}
 async function revoke(){setBusy(true);setError('');try{await familyPost('/api/family/connect-code',{operation:'revoke'});setIssued(null);setNotice('Your current Connect Code has been revoked.');}catch(e){setError(e instanceof Error?e.message:'Revocation could not be confirmed.');}finally{setBusy(false);}}
 return <main className="family-workspace family-personal"><PageHeading description="Join a wedding using your own signed-in account.">Family Connect</PageHeading>
  <Card><h2>Your Family Connect Code</h2><p>Generate a code and share it privately with the wedding organizer. They use it to prepare an invitation for your account. You must still accept that invitation to join.</p><p>A code lasts 15 minutes and can be used once. Generating another code replaces the previous one. No wedding plan is required.</p>
   <Button type="button" disabled={busy} onClick={generate}>{busy?'Please wait…':issued?'Generate a new code':'Generate Connect Code'}</Button>
   {issued&&<div className="family-result"><label htmlFor="family-code">Your Connect Code</label><textarea id="family-code" value={issued.code} readOnly autoComplete="off" spellCheck={false}/><p>Expires {displayExpiry(issued.expires_at)} · 15 minutes from generation</p><div className="family-actions"><Button type="button" variant="secondary" disabled={busy} onClick={async()=>setNotice(await copyFamilyValue(issued.code))}>Copy code</Button><Button type="button" variant="secondary" disabled={busy} onClick={revoke}>Revoke code</Button></div></div>}
   <p role="status" aria-live="polite">{notice}</p>{error&&<p role="alert" className="family-error">{error}</p>}
  </Card><Card><h2>Have your invitation?</h2><p>Open the private link from the organizer or return to a pending invitation in this browser tab. Joining grants read-only planning access, with no finance or ADAPT access.</p><Link prefetch={false} className="family-link" href="/family/accept">Open invitation acceptance</Link></Card>
 </main>;
}

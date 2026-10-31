import {notFound} from 'next/navigation';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadPlanning} from '@/server/planning';
import AppShell from '@/components/shell/AppShell';
import MemberWorkspace from './MemberWorkspace';
export async function renderMemberPlanning(client:SupabaseClient,weddingId:string,view:'overview'|'ceremonies'|'tasks',viewerLabel='Family Member'){
 const {data,error}=await loadPlanning(client,weddingId);
 if(error)return <main className="account-shell"><h1>Planning unavailable</h1><p>Please try again.</p></main>;
 if(!data)notFound();
 const label=viewerLabel.replace(/[\u0000-\u001f]/g,'').slice(0,100)||'Family Member';
 return <AppShell weddingId={weddingId} title={data.wedding.title} active={data.wedding.state==='ACTIVE'} accountLabel={label} role="Member"><MemberWorkspace data={data} view={view} viewerLabel={label}/></AppShell>;
}

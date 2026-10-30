import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadPlanning} from '@/server/planning';

export async function renderMemberPlanning(client:SupabaseClient,weddingId:string,view:'overview'|'ceremonies'|'tasks'){
 const {data,error}=await loadPlanning(client,weddingId);
 if(error)return <main className="account-shell"><h1>Planning unavailable</h1><p>Please try again.</p></main>;
 if(!data)notFound();
 const home=`/workspace/${weddingId}`;
 return <main className="account-shell">
  <p className="eyebrow">Mandapam · Member · read only</p><h1>{data.wedding.title}</h1>
  <p>You can view shared planning. Changes are managed by the wedding Admin.</p>
  <nav aria-label="Shared planning"><Link href={home} aria-current={view==='overview'?'page':undefined}>Overview</Link>{' · '}<Link href={home+'/ceremonies'} aria-current={view==='ceremonies'?'page':undefined}>Ceremonies</Link>{' · '}<Link href={home+'/tasks'} aria-current={view==='tasks'?'page':undefined}>Tasks</Link></nav>
  {view==='overview'&&<section aria-label="Wedding planning"><h2>Wedding planning</h2><p>{data.wedding.city}</p><p>{data.wedding.wedding_date??'Date not set'}{data.wedding.is_tentative?' · Tentative':''}</p><p>{data.ceremonies.length} ceremonies · {data.tasks.length} preparation tasks</p></section>}
  {view==='ceremonies'&&<section aria-label="Ceremonies"><h2>Ceremonies</h2>{data.ceremonies.length===0?<p>No ceremonies recorded.</p>:data.ceremonies.map(c=><article key={c.id}><h3>{c.title}</h3><p>{c.ceremony_date??'Date not set'} · Guests: {c.guest_count??'Unknown'}</p>{data.tasks.filter(t=>t.ceremony_id===c.id).length===0?<p>No preparation tasks recorded for this ceremony.</p>:<ul>{data.tasks.filter(t=>t.ceremony_id===c.id).map(t=><li key={t.id}><Link href={home+'/tasks#task-'+t.id}>{t.title}</Link></li>)}</ul>}</article>)}</section>}
  {view==='tasks'&&<section aria-label="Preparation tasks"><h2>Preparation tasks</h2>{data.tasks.length===0?<p>No preparation tasks recorded.</p>:data.tasks.map(t=><article key={t.id} id={'task-'+t.id}><h3>{t.title}</h3><p>{t.status.replaceAll('_',' ')} · {t.due_date??'Date not set'} · {t.owner_name??'Owner not recorded'}</p>{t.description&&<p>{t.description}</p>}</article>)}</section>}
  <form action="/auth/logout" method="post"><button type="submit">Sign out</button></form>
 </main>;
}

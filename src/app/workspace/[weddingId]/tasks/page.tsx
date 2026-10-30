import {renderMemberPlanning} from '@/components/members/MemberPlanning';
import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {accountContext} from '@/server/auth/weddings';
import {uuid} from '@/server/auth/policy';
import {loadDraft} from '@/server/create';
import AppShell from '@/components/shell/AppShell';
import ActiveTasks from '@/components/tasks/ActiveTasks';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function TasksPage({params}:{params:Promise<{weddingId:string}>}){
 const {weddingId}=await params,context=await accountContext();
 if(!context)redirect(`/login?next=${encodeURIComponent(uuid.test(weddingId)?`/workspace/${weddingId}/tasks`:'/workspace')}`);
 if(!uuid.test(weddingId))notFound();
 const {data,error}=await loadDraft(context.client,context.user.id,weddingId);
 if(error)return <main className="account-shell"><h1>Tasks unavailable</h1><p>Please try again.</p><Link href="/workspace">Return to your workspace</Link></main>;
 if(!data)return renderMemberPlanning(context.client,weddingId,'tasks');
 if(data.wedding.state!=='ACTIVE')redirect(`/workspace/${weddingId}#tasks`);
 return <AppShell weddingId={weddingId} title={data.wedding.title} active accountLabel={context.user.email??'Your account'}><ActiveTasks data={data}/></AppShell>;
}

import {redirect,notFound} from 'next/navigation';
import {accountContext} from '@/server/auth/weddings';
import {uuid} from '@/server/auth/policy';
import {loadDraft} from '@/server/create';
import {loadProposals} from '@/server/adapt';
import AdaptWorkspace from '@/components/adapt/AdaptWorkspace';
import AppShell from '@/components/shell/AppShell';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function Changes({params}:{params:Promise<{weddingId:string}>}) {
 const {weddingId}=await params,context=await accountContext();
 if(!context)redirect(`/login?next=${encodeURIComponent(uuid.test(weddingId)?`/workspace/${weddingId}/changes`:'/workspace')}`);
 if(!uuid.test(weddingId))notFound();
 const draft=await loadDraft(context.client,context.user.id,weddingId);
 if(draft.error)return <main className="account-shell"><h1>Plan unavailable</h1><p>Please try again.</p></main>;
 if(!draft.data)notFound();if(draft.data.wedding.state!=='ACTIVE')redirect(`/workspace/${weddingId}`);
 const history=await loadProposals(context.client,weddingId);
 return <AppShell weddingId={draft.data.wedding.id} title={draft.data.wedding.title} active accountLabel={context.user.email??'Your account'}><main className="adapt-page"><AdaptWorkspace data={draft.data} history={history.data} historyError={history.error}/></main></AppShell>;
}

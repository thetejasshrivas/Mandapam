import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {accountContext} from '@/server/auth/weddings';
import {uuid} from '@/server/auth/policy';
import {loadFinance} from '@/server/finance';
import BudgetWorkspace from '@/components/finance/BudgetWorkspace';
import AppShell from '@/components/shell/AppShell';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function BudgetPage({params}:{params:Promise<{weddingId:string}>}){
 const {weddingId}=await params,context=await accountContext();if(!context)redirect('/login');if(!uuid.test(weddingId))notFound();
 const result=await loadFinance(context.client,weddingId);if(result.error)return <main className="account-shell"><h1>Budget unavailable</h1><p>Please reload before making changes.</p><Link href="/workspace">Your workspace</Link></main>;if(!result.data)notFound();
 if(result.data.wedding.state!=='ACTIVE')return <main className="account-shell"><h1>Activate your draft first</h1><Link href={`/workspace/${weddingId}`}>Review your draft</Link></main>;
 return <AppShell weddingId={result.data.wedding.id} title={result.data.wedding.title} active accountLabel={context.user.email??'Your account'}><BudgetWorkspace data={result.data}/></AppShell>;
}

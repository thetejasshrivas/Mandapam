import {renderMemberPlanning} from '@/components/members/MemberPlanning';
import Link from "next/link";
import { redirect,notFound } from "next/navigation";
import { accountContext } from "@/server/auth/weddings";
import { uuid } from "@/server/auth/policy";
import {loadDraft} from '@/server/create';
import {istDate} from '@/domain/priorities';
import DraftAssignments from '@/components/tasks/DraftAssignments';
import DraftWorkspace from '@/components/create/DraftWorkspace';
import AppShell from '@/components/shell/AppShell';
import Dashboard from '@/components/dashboard/Dashboard';
import {loadFinance} from '@/server/finance';
import {loadProposals} from '@/server/adapt';
import {dashboardPresentation} from '@/presentation/dashboard';
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function PrivateWedding({params}:{params:Promise<{weddingId:string}>}) {
  const {weddingId}=await params;
  const context=await accountContext();
  if(!context)redirect(`/login?next=${encodeURIComponent(uuid.test(weddingId)?`/workspace/${weddingId}`:"/workspace")}`);
  if(!uuid.test(weddingId))notFound();
  const {data,error}=await loadDraft(context.client,context.user.id,weddingId);
  if(error)return <main className="account-shell"><h1>Workspace unavailable</h1><p>Please try again.</p><Link prefetch={false} href="/workspace">Return to your workspace</Link></main>;
  if(!data)return renderMemberPlanning(context.client,weddingId,'overview',String(context.user.user_metadata?.full_name??context.user.email??'Family Member'));
  const settingsLink=<div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}><Link className="mp-button-secondary" href={'/workspace/'+weddingId+'/settings'}>Wedding settings</Link></div>;
  if(data.wedding.state==='ACTIVE'){
    const [finance,proposals]=await Promise.all([loadFinance(context.client,weddingId),loadProposals(context.client,weddingId)]);
    const today=istDate(new Date()),model=dashboardPresentation(data,finance.error?null:finance.data,proposals.error?[]:proposals.data,today);
    return <AppShell weddingId={data.wedding.id} title={data.wedding.title} active accountLabel={context.user.email??'Your account'}>{settingsLink}<Dashboard data={data} model={model} today={today} proposalError={proposals.error}/></AppShell>;
  }
  return <AppShell weddingId={data.wedding.id} title={data.wedding.title} active={data.wedding.state==='ACTIVE'} accountLabel={context.user.email??'Your account'}>{settingsLink}<DraftWorkspace data={data} today={istDate(new Date())}/><DraftAssignments data={data}/></AppShell>;
}

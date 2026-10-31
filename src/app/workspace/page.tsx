import { redirect } from "next/navigation";
import Link from 'next/link';
import { accountContext,weddingFields } from "@/server/auth/weddings";
import {uuid} from '@/server/auth/policy';
import AppShell from '@/components/shell/AppShell';
import {Card,PageHeading} from '@/components/ui/Primitives';
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function Workspace({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const context=await accountContext();
  if(!context)redirect("/login?next=/workspace");
  const {data,error}=await context.client.from("weddings").select(weddingFields).eq("owner_user_id",context.user.id).maybeSingle();
  if(data)redirect(`/workspace/${data.id}`);
  if(!error){
    const shared=await context.client.rpc('member_workspaces');
    const rows=shared.data as {id:string;title:string;city:string;state:string}[]|null;
    if(shared.error||!Array.isArray(rows)||rows.some(w=>!w||typeof w.id!=='string'||!uuid.test(w.id)||typeof w.title!=='string'||typeof w.city!=='string'||typeof w.state!=='string'))return <main className="account-shell"><h1>Shared workspaces unavailable</h1><p>Please reload to check your accepted invitations.</p></main>;
    if(rows.length===1)redirect('/workspace/'+rows[0].id);
    if(rows.length>1)return <AppShell weddingId={null} title="Your shared wedding plans" active={false} role="Member" accountLabel={context.user.email??'Your account'}><main className="draft-shell"><PageHeading description="Open a wedding you have joined. Only assigned tasks can be updated.">Shared workspaces</PageHeading>{rows.map(w=><Card key={w.id}><h2>{w.title}</h2><p>{w.city} · Member</p><Link className="mp-button mp-button-primary" href={'/workspace/'+w.id}>Open shared workspace</Link></Card>)}</main></AppShell>;
  }
  const query=await searchParams;
  return <AppShell weddingId={null} title="Start your wedding plan" active={false} accountLabel={context.user.email??'Your account'}><main className="draft-shell"><Card><PageHeading description="One private wedding plan, thoughtfully prepared.">Your private workspace</PageHeading>
    <p>Invited to someone else&apos;s wedding? <Link href="/family/connect" prefetch={false}>Open Family Connect</Link> to share your code, or <Link href="/family/accept" prefetch={false}>open your invitation</Link>. You do not need to create a wedding.</p>
    {error ? <p role="alert">Your workspace could not be loaded. Please try again.</p>:<><p>Start one wedding plan for your account. Ceremony and task setup follows in CREATE.</p>
      {query.error&&<p className="account-notice" role="alert">{query.error==="exists"?"This account already has a wedding. Reload to open it.":"The wedding could not be created. Check the details and try again."}</p>}
      <form action="/api/weddings" method="post" className="account-form"><label htmlFor="title">Wedding title</label><input id="title" name="title" maxLength={100} required/><label htmlFor="city">City</label><input id="city" name="city" maxLength={100} required/><button>Create my wedding</button></form></>}
  </Card></main></AppShell>;
}

import { redirect } from "next/navigation";
import Link from 'next/link';
import { accountContext,weddingFields } from "@/server/auth/weddings";
import AppShell from '@/components/shell/AppShell';
import {Card,PageHeading} from '@/components/ui/Primitives';
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function Workspace({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const context=await accountContext();
  if(!context)redirect("/login?next=/workspace");
  const {data,error}=await context.client.from("weddings").select(weddingFields).eq("owner_user_id",context.user.id).maybeSingle();
  if(data)redirect(`/workspace/${data.id}`);
  const query=await searchParams;
  return <AppShell weddingId={null} title="Start your wedding plan" active={false} accountLabel={context.user.email??'Your account'}><main className="draft-shell"><Card><PageHeading description="One private wedding plan, thoughtfully prepared.">Your private workspace</PageHeading>
    <p>Invited to someone else&apos;s wedding? <Link href="/family/connect" prefetch={false}>Open Family Connect</Link> to share your code, or <Link href="/family/accept" prefetch={false}>open your invitation</Link>. You do not need to create a wedding.</p>
    {error ? <p role="alert">Your workspace could not be loaded. Please try again.</p>:<><p>Start one wedding plan for your account. Ceremony and task setup follows in CREATE.</p>
      {query.error&&<p className="account-notice" role="alert">{query.error==="exists"?"This account already has a wedding. Reload to open it.":"The wedding could not be created. Check the details and try again."}</p>}
      <form action="/api/weddings" method="post" className="account-form"><label htmlFor="title">Wedding title</label><input id="title" name="title" maxLength={100} required/><label htmlFor="city">City</label><input id="city" name="city" maxLength={100} required/><button>Create my wedding</button></form></>}
  </Card></main></AppShell>;
}

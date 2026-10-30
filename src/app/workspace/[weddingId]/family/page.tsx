import {redirect,notFound} from 'next/navigation';
import {accountContext} from '@/server/auth/weddings';
import {uuid} from '@/server/auth/policy';
import {invitationInfo,type InvitationInfo} from '@/server/invitations';
import AppShell from '@/components/shell/AppShell';
import FamilyAccess from '@/components/family/FamilyAccess';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function FamilyPage({params}:{params:Promise<{weddingId:string}>}){
 const {weddingId}=await params,context=await accountContext();
 if(!context)redirect('/login?next='+encodeURIComponent(uuid.test(weddingId)?`/workspace/${weddingId}/family`:'/workspace'));
 if(!uuid.test(weddingId))notFound();
 const {data,error}=await context.client.from('weddings').select('id,title,state').eq('id',weddingId).eq('owner_user_id',context.user.id).maybeSingle();
 if(error)return <main className="account-shell"><h1>Family &amp; Access unavailable</h1><p>Please try again.</p></main>;
 if(!data)notFound();
 const history=await context.client.rpc('invitation_list',{p_id:weddingId});
 const available=!history.error&&Array.isArray(history.data);
 return <AppShell weddingId={weddingId} title={data.title} active={data.state==='ACTIVE'} accountLabel={context.user.email??'Your account'}><FamilyAccess weddingId={weddingId} initialInvitations={available?(history.data as InvitationInfo[]).map(invitationInfo):[]} historyUnavailable={!available}/></AppShell>;
}

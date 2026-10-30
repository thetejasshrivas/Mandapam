import Link from 'next/link';
import {accountContext} from '@/server/auth/weddings';
import AppShell from '@/components/shell/AppShell';
import InvitationAccept from '@/components/family/InvitationAccept';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function AcceptPage(){
 const context=await accountContext();
 if(!context)return <div className="account-shell"><Link href="/" prefetch={false} className="wordmark">Mandapam</Link><InvitationAccept authenticated={false}/></div>;
 return <AppShell weddingId={null} title="Your invitation" active={false} accountLabel={context.user.email??'Your account'}><InvitationAccept authenticated/></AppShell>;
}

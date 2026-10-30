import {redirect} from 'next/navigation';
import {accountContext} from '@/server/auth/weddings';
import AppShell from '@/components/shell/AppShell';
import FamilyConnect from '@/components/family/FamilyConnect';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function ConnectPage(){
 const context=await accountContext();if(!context)redirect('/login?next=%2Ffamily%2Fconnect');
 return <AppShell weddingId={null} title="Family Connect" active={false} accountLabel={context.user.email??'Your account'}><FamilyConnect/></AppShell>;
}

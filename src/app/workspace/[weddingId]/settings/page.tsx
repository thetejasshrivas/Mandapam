import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {accountContext,weddingFields} from '@/server/auth/weddings';
import {uuid} from '@/server/auth/policy';
import AppShell from '@/components/shell/AppShell';
import DeleteWedding from '@/components/settings/DeleteWedding';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function WeddingSettings({params}:{params:Promise<{weddingId:string}>}){
 const {weddingId}=await params;
 const context=await accountContext();
 if(!context)redirect('/login?next='+encodeURIComponent(uuid.test(weddingId)?'/workspace/'+weddingId:'/workspace'));
 if(!uuid.test(weddingId))notFound();
 const {data,error}=await context.client.from('weddings').select(weddingFields).eq('id',weddingId).eq('owner_user_id',context.user.id).maybeSingle();
 if(error)return <main className="account-shell"><h1>Settings unavailable</h1><p>Please try again.</p><Link href="/workspace">Return to workspace</Link></main>;
 if(!data)notFound();
 return <AppShell weddingId={data.id} title={data.title} active={data.state==='ACTIVE'} accountLabel={context.user.email??'Your account'}><Link href={'/workspace/'+data.id} className="mp-button-secondary">Back to wedding</Link><h1 style={{marginTop:24}}>Wedding settings</h1><p>Manage this wedding and its planning information.</p><DeleteWedding weddingId={data.id} title={data.title} version={String(data.state_version)}/></AppShell>;
}

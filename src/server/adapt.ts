import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {AdaptSnapshot} from '@/domain/adapt';
export type Proposal={id:string;wedding_id:string;ceremony_id:string;base_wedding_version:string;old_guest_count:number;new_guest_count:number;status:'PENDING'|'REJECTED'|'APPLIED';preview_snapshot:AdaptSnapshot;created_at:string;decided_at:string|null;applied_version?:string|null;applied_audit_event_id?:string|null};
export async function loadProposals(client:SupabaseClient,weddingId:string) {
 const result=await client.from('change_proposals').select('id,wedding_id,ceremony_id,base_wedding_version,old_guest_count,new_guest_count,status,preview_snapshot,created_at,decided_at,applied_version,applied_audit_event_id').eq('wedding_id',weddingId).order('created_at',{ascending:false}).order('id').limit(20);
 return {data:(result.data??[]) as Proposal[],error:!!result.error};
}

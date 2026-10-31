import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Draft} from '@/domain/create';
import {weddingFields} from '@/server/auth/weddings';
export async function loadDraft(client:SupabaseClient,userId:string,weddingId:string):Promise<{data:Draft|null;error:boolean}> {
  const wedding=await client.from('weddings').select(weddingFields).eq('id',weddingId).eq('owner_user_id',userId).maybeSingle();
  if(wedding.error)return {data:null,error:true};
  if(!wedding.data)return {data:null,error:false};
  const [ceremonies,tasks]=await Promise.all([
    client.from('ceremonies').select('id,title,ceremony_date,guest_count,is_archived').eq('wedding_id',weddingId).order('created_at').order('id'),
    client.from('tasks').select('id,ceremony_id,title,description,owner_name,due_date,status,template_key,prerequisite_task_id,dismissed_at,archived_at,completed_at,status_confirmed_at,status_confirmed_by,created_at,updated_at,assigned_member_id,progress_note,progress_updated_by,progress_updated_at').eq('wedding_id',weddingId).order('created_at').order('id'),
  ]);
  if(ceremonies.error||tasks.error)return {data:null,error:true};
  return {data:{wedding:wedding.data,ceremonies:ceremonies.data,tasks:tasks.data} as Draft,error:false};
}

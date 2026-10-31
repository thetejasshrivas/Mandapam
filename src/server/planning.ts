import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';

export type Planning={
 wedding:{id:string;title:string;city:string;wedding_date:string|null;is_tentative:boolean;state:string;state_version:string};
 ceremonies:{id:string;title:string;ceremony_date:string|null;guest_count:number|null}[];
 tasks:{id:string;ceremony_id:string|null;title:string;description:string|null;owner_name:string|null;due_date:string|null;status:string;prerequisite_task_id:string|null;completed_at:string|null;assigned_to_me:boolean;has_assignee:boolean;progress_note:string|null;progress_updated_at:string|null}[];
};
export async function loadPlanning(client:SupabaseClient,weddingId:string):Promise<{data:Planning|null;error:boolean}>{
 try{
  const result=await client.rpc('planning_read',{p_id:weddingId});
  if(result.error)return{data:null,error:true};
  if(!result.data)return{data:null,error:false};
  const source=result.data as Planning;
  if(source.wedding?.id!==weddingId||!Array.isArray(source.ceremonies)||!Array.isArray(source.tasks))return{data:null,error:true};
  // Copy only the approved projection, even if a future RPC adds owner-only fields.
  const {id,title,city,wedding_date,is_tentative,state,state_version}=source.wedding;
  return{error:false,data:{wedding:{id,title,city,wedding_date,is_tentative,state,state_version},
   ceremonies:source.ceremonies.map(({id,title,ceremony_date,guest_count})=>({id,title,ceremony_date,guest_count})),
   tasks:source.tasks.map(({id,ceremony_id,title,description,owner_name,due_date,status,prerequisite_task_id,completed_at,assigned_to_me,has_assignee,progress_note,progress_updated_at})=>({id,ceremony_id,title,description,owner_name,due_date,status,prerequisite_task_id,completed_at,assigned_to_me:assigned_to_me===true,has_assignee:has_assignee===true,progress_note,progress_updated_at})),
  }};
 }catch{return{data:null,error:true};}
}

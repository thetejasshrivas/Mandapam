import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Wedding} from '@/domain/create';
import {summarizeWedding,type CostItem,type CashEntry,type FinanceCeremony} from '@/domain/finance';
export type FinanceSnapshot={wedding:Wedding;ceremonies:(FinanceCeremony&{title:string})[];items:(CostItem&{title:string;updated_at:string})[];cash:CashEntry[];audit:{id:string;action:string;created_at:string;before_after:Record<string,unknown>}[]};
export async function loadFinance(client:SupabaseClient,weddingId:string) {
 const result=await client.rpc('finance_read',{p_id:weddingId});if(result.error)return {data:null,error:true};if(!result.data)return {data:null,error:false};
 try{const data=result.data as FinanceSnapshot;summarizeWedding(data.wedding.id,data.items,data.ceremonies,data.cash,data.wedding.budget_ceiling_paise);return {data,error:false};}catch{return {data:null,error:true};}
}

// Read-only presentation of the existing, validated financial snapshot.
import {evaluateCost,summarizeWedding,sumPaise,formatINR,type CostItem,type CashEntry,type FinanceCeremony} from '../domain/finance.ts';
export function formatMobileINR(value:string|null):string {return formatINR(value).replace(/\.00$/,'');}
type NamedCost=CostItem&{title:string};
type NamedCeremony=FinanceCeremony&{title:string};
export function ratioBasisPoints(amount:string,total:string):number|null {
 const denominator=BigInt(total);if(denominator<=0n)return null;
 const ratio=BigInt(amount)*10000n/denominator;
 return Number(ratio<0n?0n:ratio>10000n?10000n:ratio);
}
export function financePresentation(weddingId:string,items:readonly NamedCost[],ceremonies:readonly NamedCeremony[],cash:readonly CashEntry[],ceiling:string|null) {
 const summary=summarizeWedding(weddingId,items,ceremonies,cash,ceiling);
 const records=items.filter(item=>!item.archived_at).map(item=>{
  const ceremony=ceremonies.find(c=>c.id===item.ceremony_id)??null,ledger=cash.filter(e=>e.cost_item_id===item.id);
  return {item,ceremony,ledger,result:evaluateCost(item,ceremony,ledger)};
 });
 const commitments=sumPaise(records.filter(r=>r.item.state==='COMMITTED').flatMap(r=>r.item.commitment_paise===null?[]:[r.item.commitment_paise]));
 const obligations=sumPaise(records.flatMap(r=>r.result.obligation.kind==='KNOWN'?[r.result.obligation.amount_paise!]:[]));
 // Cap paid amounts per record, never let one record's excess pay another's balance.
 const applied=sumPaise(records.flatMap(r=>r.result.obligation.kind==='KNOWN'?[(BigInt(r.result.obligation.amount_paise!)-BigInt(r.result.outstanding_paise!)).toString()]:[]));
 const groups: {id:string;title:string;records:typeof records;forecast:string;paid:string;unknown:number}[]=[];
 for(const record of records){
  const id=record.item.ceremony_id??'shared';let group=groups.find(g=>g.id===id);
  if(!group){group={id,title:record.ceremony?.title??'Shared wedding costs',records:[],forecast:'0',paid:'0',unknown:0};groups.push(group);}
  group.records.push(record);group.paid=sumPaise([group.paid,record.result.cash.net_cash_paid_paise]);
  if(record.result.forecast.amount_paise===null)group.unknown++;else group.forecast=sumPaise([group.forecast,record.result.forecast.amount_paise]);
 }
 return {summary,records,groups,commitments,obligations,applied,unallocatedCash:(BigInt(summary.net_cash_paid_paise)-BigInt(applied)).toString()};
}

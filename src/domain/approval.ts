import {parseVersion} from './create.ts';
export type ApprovalOutcome={id:string;status:'PENDING'|'REJECTED'|'APPLIED';current_guest_count:number|null;base_wedding_version:string;current_version:string;applied_version:string|null;applied_audit_event_id:string|null;decided_at:string|null};
export function approvalRecovery(input:unknown) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Authoritative status is unavailable.');
 const row=input as ApprovalOutcome,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(row.id)||!['PENDING','REJECTED','APPLIED'].includes(row.status))throw Error('Invalid proposal status.');
 parseVersion(row.base_wedding_version);parseVersion(row.current_version);
 if(row.current_guest_count!==null&&(!Number.isInteger(row.current_guest_count)||row.current_guest_count<1||row.current_guest_count>10000))throw Error('Invalid current headcount.');
 if(row.status==='APPLIED'){
  parseVersion(row.applied_version);if(!row.applied_audit_event_id||!uuid.test(row.applied_audit_event_id)||!row.decided_at||BigInt(row.applied_version!)>BigInt(row.current_version))throw Error('Applied outcome is incomplete.');
  return {outcome:row,resolved:true,applied:true,allow_mutations:true,message:`Application confirmed by authoritative status refresh. Current guest count: ${row.current_guest_count??'Unknown'}.`};
 }
 if(row.applied_version!==null||row.applied_audit_event_id!==null)throw Error('Conflicting proposal metadata.');
 if(row.status==='REJECTED')return {outcome:row,resolved:true,applied:false,allow_mutations:true,message:'Proposal is REJECTED and cannot be approved.'};
 return {outcome:row,resolved:false,applied:false,allow_mutations:false,message:'Proposal is still PENDING. This does not prove failure; refresh status before making another change.'};
}

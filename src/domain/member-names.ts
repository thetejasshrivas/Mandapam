// Profile metadata is untrusted display text. UUIDs alone identify assignments.
export function memberLabels(members:{id:string;display_name?:unknown}[]):{id:string;label:string}[]{
 const names=members.map(m=>typeof m.display_name==='string'?m.display_name.replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,100)||'Family Member':'Family Member');
 return members.map((m,i)=>{const duplicates=names.filter(n=>n.toLowerCase()===names[i].toLowerCase()).length>1;
 const suffix=members.some((other,j)=>j!==i&&names[j].toLowerCase()===names[i].toLowerCase()&&other.id.slice(-8)===m.id.slice(-8))?m.id:m.id.slice(-8);
 return{id:m.id,label:names[i]+(duplicates?' · '+suffix:'')};});
}

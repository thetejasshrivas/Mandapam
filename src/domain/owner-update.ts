import {displayDate} from './create.ts';
export type UpdateTask={title:string;owner_name:string|null;status:string;due_date:string|null;archived_at?:string|null;dismissed_at?:string|null;blocked?:boolean};
const privateText=/(?:[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]|\p{Sc}|खर्च|भुगतान|रुपये|पैसे|बजट|नकद|रिफंड|@|https?:|\d{4,}|\b(?:cost|costs|estimate|balance|advance|budget|cash|commitment|payment|payments|paid|pay|refund|refunds|settlement|invoice|bank|deposit|transfer|rupees?|inr|rs|usd|eur|gbp|lakh|crore)\b)/iu;
export function ownerUpdate(owner:string,tasks:UpdateTask[]) {
 if(!owner||privateText.test(owner))return {text:'',count:0,omitted:0};
 const eligible=tasks.filter(t=>t.owner_name===owner&&!t.archived_at&&!t.dismissed_at&&['TO_DO','IN_PROGRESS','DEFERRED'].includes(t.status));
 const safe=eligible.filter(t=>!!t.title.trim()&&!privateText.test(t.title));
 const lines=safe.map((task,index)=>`${index+1}. ${task.title.trim()} — ${displayDate(task.due_date)} · ${task.status==='DEFERRED'?'Deferred — review before resuming':task.status==='IN_PROGRESS'?'In progress':'To do'}${task.blocked?' · Waiting for a prerequisite; check the private plan.':''}`);
 const text=lines.length?`Task update for ${owner}\n\n${lines.join('\n')}\n\nPlease review these tasks and let the coordinator know your progress.`:'';
 return {text,count:safe.length,omitted:eligible.length-safe.length};
}

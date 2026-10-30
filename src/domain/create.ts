export const ceremonyCatalog=[
  {key:'roka',title:'Roka/Engagement'},{key:'haldi',title:'Haldi'},{key:'mehendi',title:'Mehendi'},
  {key:'sangeet',title:'Sangeet'},{key:'wedding',title:'Wedding/Pheras'},{key:'reception',title:'Reception'},
] as const;
export type Ceremony={id:string;title:string;ceremony_date:string|null;guest_count:number|null;is_archived:boolean};
export type DraftTask={id:string;created_at?:string;ceremony_id:string|null;title:string;description:string|null;owner_name:string|null;due_date:string|null;status:string;template_key:string|null;prerequisite_task_id:string|null;dismissed_at:string|null;archived_at:string|null;completed_at?:string|null;status_confirmed_at?:string|null;status_confirmed_by?:string|null;updated_at?:string};
export type Wedding={id:string;title:string;city:string;wedding_date:string|null;is_tentative:boolean;budget_ceiling_paise:string|null;state:string;state_version:string;draft_locked:boolean};
export type Draft={wedding:Wedding;ceremonies:Ceremony[];tasks:DraftTask[]};
const identifier=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid form data.');
  return value as Record<string,unknown>;
}
function allowed(value:Record<string,unknown>,keys:string[]) {if(Object.keys(value).some(key=>!keys.includes(key)))throw Error('Unsupported form field.');}
function text(value:unknown,max:number,label:string,optional=false):string|null {
  if(value==null||value==='') {if(optional)return null;throw Error(`${label} is required.`);}
  if(typeof value!=='string')throw Error(`${label} must be text.`);
  const result=value.trim();
  if(result.length>max||(!result&&!optional))throw Error(`${label} must contain ${optional?'up to':'1–'}${max} characters.`);
  return result||null;
}
export function calendarDate(value:unknown):string {
  if(value==null||value==='')return '';
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Use a valid YYYY-MM-DD calendar date.');
  const [year,month,day]=value.split('-').map(Number);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1||month<1||month>12||day<1||day>days[month-1])throw Error('Use a valid calendar date.');
  return value;
}
export function displayDate(value:string|null):string {
  if(!value)return 'Date not set';
  const [year,month,day]=calendarDate(value).split('-');
  return `${Number(day)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)-1]} ${year}`;
}
export function toPaise(value:unknown):string|null {
  if(value==null||value==='')return null;
  if(typeof value!=='string')throw Error('Enter the budget as INR text.');
  const input=value.trim();if(!input)return null;
  if(!/^\d+(?:\.\d{1,2})?$/.test(input))throw Error('Use a nonnegative INR amount with at most two decimal places.');
  const [whole,fraction='']=input.split('.');const paise=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(paise>100000000000n)throw Error('Budget must not exceed INR 100 crore.');
  return paise.toString();
}
export function toRupees(value:string|null):string {if(value===null)return '';const amount=BigInt(value);return `${amount/100n}.${(amount%100n).toString().padStart(2,'0')}`;}
export function parseVersion(value:unknown):string {
  if(typeof value!=='string'||!/^(0|[1-9]\d*)$/.test(value)||value.length>19||BigInt(value)>9223372036854775807n)throw Error('Reload the current draft before saving.');
  return value;
}
function id(value:unknown):string|null {if(value==null||value==='')return null;if(typeof value!=='string'||!identifier.test(value))throw Error('Invalid ceremony reference.');return value;}
export function parseSetup(input:unknown) {
  const fields=object(input);allowed(fields,['title','city','wedding_date','is_tentative','budget','ceremonies']);
  const date=calendarDate(fields.wedding_date)||null;
  if(fields.is_tentative!==undefined&&fields.is_tentative!=='on')throw Error('Invalid tentative-date selection.');
  const tentative=fields.is_tentative==='on';if(!date&&!tentative)throw Error('Enter a wedding date or mark it tentative.');
  if(typeof fields.ceremonies!=='string')throw Error('Choose your ceremonies.');
  let choices:unknown;try {choices=JSON.parse(fields.ceremonies);}catch{throw Error('Invalid ceremony selection.');}
  if(!Array.isArray(choices)||choices.length<1||choices.length>12)throw Error('Choose between one and twelve ceremonies.');
  const ceremonies=choices.map(value=>{
    const item=object(value);allowed(item,['id','title','date','guest_count']);
    const raw=item.guest_count;let count:number|null=null;
    if(raw!=null&&raw!=='') {
      if((typeof raw!=='string'||!/^\d+$/.test(raw))&&(typeof raw!=='number'||!Number.isInteger(raw)))throw Error('Guest counts must be whole numbers.');
      count=Number(raw);if(!Number.isInteger(count)||count<1||count>10000)throw Error('Guest counts must be between 1 and 10,000.');
    }
    return {id:id(item.id),title:text(item.title,80,'Ceremony title')!,ceremony_date:calendarDate(item.date)||null,guest_count:count};
  });
  const references=ceremonies.flatMap(c=>c.id?[c.id]:[]);if(new Set(references).size!==references.length)throw Error('A ceremony cannot be selected twice.');
  return {title:text(fields.title,100,'Wedding title')!,city:text(fields.city,100,'City')!,wedding_date:date,is_tentative:tentative,budget_ceiling_paise:toPaise(fields.budget),ceremonies};
}
export function parseTask(input:unknown,adding:boolean) {
  const fields=object(input);allowed(fields,['title','description','owner_name','due_date',...(adding?['ceremony_id']:[])]);
  const result={title:text(fields.title,160,'Task title')!,description:text(fields.description,1000,'Task notes',true),owner_name:text(fields.owner_name,100,'Owner name',true),due_date:calendarDate(fields.due_date)||null};
  return adding?{...result,ceremony_id:id(fields.ceremony_id)}:result;
}

export const AI_MODEL='gemini-3.5-flash-lite';
export type Suggestion={title:string;reason:string};
export type SafeAiContext={ceremonies:string[];existing_titles:string[];dismissed_titles:string[]};
const ceremonies=['Roka/Engagement','Haldi','Mehendi','Sangeet','Wedding/Pheras','Reception'];
const genericTitles=['Agree planning responsibilities','Prepare a first guest list','Choose invitation wording','Review invitation details','Send invitations','Review travel and accessibility needs','Record the planned location','Draft a simple running order','Review supplies and responsibilities'];
export function normalizeSuggestionTitle(value:string) {return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function titleKeys(title:string) {return [title,title.includes(':')?title.slice(title.indexOf(':')+1):title].map(normalizeSuggestionTitle);}
export function safeAiContext(selected:{id:string;title:string}[],tasks:{title:string;status:string;dismissed_at:string|null}[]):SafeAiContext {
 const canonical=(title:string)=>genericTitles.find(candidate=>titleKeys(title).includes(normalizeSuggestionTitle(candidate)));
 const titles=(dismissed:boolean)=>[...new Set(tasks.filter(t=>!!t.dismissed_at===dismissed).map(t=>canonical(t.title)).filter((title):title is string=>!!title))].slice(0,10);
 return {ceremonies:[...new Set(selected.map(c=>ceremonies.includes(c.title)?c.title:'Custom ceremony'))].slice(0,3),existing_titles:titles(false),dismissed_titles:titles(true)};
}
export function parseAiInput(input:unknown) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid suggestion request.');
 const row=input as Record<string,unknown>,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(Object.keys(row).some(key=>!['wedding_id','ceremony_ids'].includes(key))||typeof row.wedding_id!=='string'||!uuid.test(row.wedding_id)||!Array.isArray(row.ceremony_ids)||row.ceremony_ids.length<1||row.ceremony_ids.length>3||row.ceremony_ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(row.ceremony_ids).size!==row.ceremony_ids.length)throw Error('Choose one to three saved ceremonies.');
 return {wedding_id:row.wedding_id,ceremony_ids:row.ceremony_ids as string[]};
}
export function validateSuggestions(input:unknown):Suggestion[] {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid suggestions.');
 const row=input as Record<string,unknown>;
 if(Object.keys(row).length!==1||!Array.isArray(row.suggestions)||row.suggestions.length>3)throw Error('Invalid suggestions.');
 return row.suggestions.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!('title' in value)||!('reason' in value))throw Error('Invalid suggestion fields.');
  const {title,reason}=value;
  if(typeof title!=='string'||typeof reason!=='string'||[...title.trim()].length<5||[...title].length>120||[...reason.trim()].length<5||[...reason].length>240||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title+reason))throw Error('Invalid suggestion lengths.');
  return {title:title.trim().replace(/\s+/g,' '),reason:reason.trim().replace(/\s+/g,' ')};
 });
}
export function filterSuggestions(suggestions:Suggestion[],existingTitles:string[]):Suggestion[] {
 const seen=new Set(existingTitles.flatMap(titleKeys));
 const unsafe=/(?:₹|\b(?:inr|rs|rupees?|price|prices|cost|costs|pay|deposit|refund|discount|guaranteed?|available|availability|mandatory|must|required|muhurat|contract|api key|secret|password)\b|@|https?:|\d{4,})/i;
 return suggestions.filter(item=>{const keys=titleKeys(item.title);if(unsafe.test(item.title+' '+item.reason)||keys.some(key=>seen.has(key)))return false;keys.forEach(key=>seen.add(key));return true;}).slice(0,3);
}
export const suggestionSchema={type:'object',additionalProperties:false,required:['suggestions'],properties:{suggestions:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['title','reason'],properties:{title:{type:'string',minLength:5,maxLength:120},reason:{type:'string',minLength:5,maxLength:240}}}}}};

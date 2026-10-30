import type {NextRequest} from 'next/server';
import {appOrigin} from '@/server/auth/config';
import {routeClient,verifiedUser,jsonResponse} from '@/server/auth/client';
import {sameOrigin,uuid} from '@/server/auth/policy';
import {parseSetup,parseTask,parseVersion} from '@/domain/create';
import {loadDraft} from '@/server/create';
export const dynamic='force-dynamic';
type Route={params:Promise<{weddingId:string}>};
export async function GET(request:NextRequest,{params}:Route) {
  const {weddingId}=await params;
  const holder=jsonResponse(null),client=routeClient(request,holder);
  if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
  const user=await verifiedUser(client);
  if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
  if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
  const result=await loadDraft(client,user.id,weddingId);
  const response=result.error?jsonResponse({error:{code:'UNAVAILABLE',message:'Draft unavailable. Try again.'}},503):result.data?jsonResponse({data:result.data}):jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
  holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}
function fieldsOnly(fields:Record<string,unknown>,allowed:string[]) {if(Object.keys(fields).some(key=>!allowed.includes(key)))throw Error('Unsupported form field.');}
export async function POST(request:NextRequest,{params}:Route) {
  const origin=appOrigin();
  if(!origin||!sameOrigin(origin,request.headers.get('origin')))return jsonResponse({error:{code:'FORBIDDEN',message:'Request origin is not allowed.'}},403);
  const {weddingId}=await params;
  const holder=jsonResponse(null),client=routeClient(request,holder);
  if(!client)return jsonResponse({error:{code:'UNAVAILABLE',message:'Account access unavailable.'}},503);
  const user=await verifiedUser(client);
  if(!user)return jsonResponse({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},401);
  if(!uuid.test(weddingId))return jsonResponse({error:{code:'NOT_FOUND',message:'Wedding not found.'}},404);
  let body:Record<string,unknown>;
  try {
    const raw=await request.text();if(raw.length>65536)throw Error();
    body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['operation','version','fields'].includes(k)))throw Error();
  }catch{return jsonResponse({error:{code:'VALIDATION',message:'Invalid draft request.'}},400);}
  let rpc:string;let args:Record<string,unknown>;
  try {
    const version=parseVersion(body.version);
    if(!body.fields||typeof body.fields!=='object'||Array.isArray(body.fields))throw Error('Invalid form fields.');
    const fields=body.fields as Record<string,unknown>;
    args={p_id:weddingId,p_version:version};
    switch(body.operation) {
      case 'setup': {
        const setup=parseSetup(fields);rpc='save_draft_setup';args={...args,p_title:setup.title,p_city:setup.city,p_date:setup.wedding_date,p_tentative:setup.is_tentative,p_budget:setup.budget_ceiling_paise,p_ceremonies:setup.ceremonies};break;
      }
      case 'generate':fieldsOnly(fields,[]);rpc='generate_draft';break;
      case 'reopen':fieldsOnly(fields,['confirmed','keep_manual']);rpc='reopen_draft';args={...args,p_confirm:fields.confirmed==='on',p_keep_manual:fields.keep_manual==='on'};break;
      case 'add': {
        const task=parseTask(fields,true);rpc='add_draft_task';args={...args,p_ceremony:'ceremony_id' in task?task.ceremony_id:null,p_title:task.title,p_description:task.description,p_owner:task.owner_name,p_due:task.due_date};break;
      }
      case 'edit': {
        fieldsOnly(fields,['task_id','title','description','owner_name','due_date']);
        if(typeof fields.task_id!=='string'||!uuid.test(fields.task_id))throw Error('Invalid task reference.');
        const {task_id,...values}=fields;const task=parseTask(values,false);rpc='edit_draft_task';args={...args,p_task:task_id,p_title:task.title,p_description:task.description,p_owner:task.owner_name,p_due:task.due_date};break;
      }
      case 'dismiss':fieldsOnly(fields,['task_id']);if(typeof fields.task_id!=='string'||!uuid.test(fields.task_id))throw Error('Invalid task reference.');rpc='dismiss_draft_task';args={...args,p_task:fields.task_id};break;
      case 'activate':fieldsOnly(fields,['confirmed']);rpc='activate_plan';args={...args,p_confirm:fields.confirmed==='on'};break;
      default:throw Error('Unsupported draft action.');
    }
  }catch(error){return jsonResponse({error:{code:'VALIDATION',message:error instanceof Error?error.message:'Check the form details.'}},400);}
  try {
    const {data,error}=await client.rpc(rpc,args);
    if(error) {
      const denied=error.code==='42501';
      const conflict=['40001','55000','23514'].includes(error.code);
      const status=denied?404:conflict?409:error.code.startsWith('22')||error.code==='23503'?400:503;
      const message=denied?'Wedding or task not available.':error.code==='40001'?'The draft changed. Reload and review before saving.':error.code==='55000'?'This action is draft-only. For selection changes, use Rebuild draft first.':error.code==='23514'?'Keep required dependent work and protected history. Dismiss dependents first, or retain the ceremony.':status===400?'Check the dates, amounts and ceremony references.':'The save could not be confirmed. Reload to check the current draft before retrying.';
      return jsonResponse({error:{code:denied?'NOT_FOUND':conflict?'CONFLICT':status===400?'VALIDATION':'UNAVAILABLE',message}},status);
    }
    const response=jsonResponse({data});holder.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
  }catch{return jsonResponse({error:{code:'UNAVAILABLE',message:'The save outcome is unknown. Reload the draft before retrying.'}},503);}
}

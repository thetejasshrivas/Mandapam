import 'server-only';
import {jsonResponse} from '@/server/auth/client';
import type {NextResponse} from 'next/server';

export function invitationResponse(holder:NextResponse|null,data:unknown,status=200){
 const response=jsonResponse(data,status);
 response.headers.set('Referrer-Policy','no-referrer');
 holder?.cookies.getAll().forEach(cookie=>response.cookies.set(cookie));
 return response;
}
export function invitationFailure(holder:NextResponse|null,code:string){
 const status=code==='RATE_LIMITED'?429:['42501','NOT_FOUND'].includes(code)?404:['23505','55000','CONFLICT'].includes(code)?409:['22023','23503'].includes(code)?400:503;
 return invitationResponse(holder,{error:{code:status===429?'RATE_LIMITED':status===404?'NOT_FOUND':status===409?'CONFLICT':status===400?'VALIDATION':'UNAVAILABLE',message:'Invitation request could not be completed.'}},status);
}
export type InvitationInfo={id:string;recipient_user_id:string;expires_at:string;accepted_at:string|null;revoked_at:string|null};
export function invitationInfo({id,recipient_user_id,expires_at,accepted_at,revoked_at}:InvitationInfo):InvitationInfo{
 return{id,recipient_user_id,expires_at,accepted_at,revoked_at};
}

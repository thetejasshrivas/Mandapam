export type NavigationKey='dashboard'|'tasks'|'budget'|'ceremonies'|'changes'|'family';
export type NavigationItem={key:NavigationKey;label:string;href:string};
export function accountIdentity(label:string):string{const parts=label.split('@');return parts.length===2?`${parts[0].slice(0,1)}•••@${parts[1]}`:'Your account';}
export function shellNavigation(weddingId:string|null,active:boolean):NavigationItem[]{
 const home=weddingId?`/workspace/${weddingId}`:'/workspace';
 const dashboard:NavigationItem={key:'dashboard',label:'Dashboard',href:home};
 const family:NavigationItem={key:'family',label:'Family & Access',href:weddingId?home+'/family':'/family/connect'};
 if(!weddingId)return[dashboard,family];
 return[dashboard,{key:'tasks',label:'Tasks',href:home+(active?'/tasks':'#tasks')},...(active?[{key:'budget' as const,label:'Budget & Payments',href:home+'/budget'}]:[]),{key:'ceremonies',label:'Ceremonies',href:home+(active?'/ceremonies':'#ceremonies')},...(active?[{key:'changes' as const,label:'Changes / ADAPT',href:home+'/changes'}]:[]),family];
}
export function currentNavigation(pathname:string,hash:string):NavigationKey{
 if(pathname.endsWith('/family')||pathname.startsWith('/family/'))return'family';
 if(pathname.endsWith('/tasks'))return'tasks';
 if(pathname.endsWith('/ceremonies'))return'ceremonies';
 if(pathname.endsWith('/budget'))return'budget';
 if(pathname.endsWith('/changes'))return'changes';
 if(hash==='#tasks'||hash.startsWith('#task-'))return'tasks';
 if(hash==='#ceremonies')return'ceremonies';
 return'dashboard';
}

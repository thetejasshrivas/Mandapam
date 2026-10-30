import type {Ceremony,DraftTask} from '../domain/create.ts';
import {taskProgress} from './dashboard.ts';
import {filterTasks,readiness} from '../domain/tasks.ts';

export function ceremoniesPresentation(ceremonies:readonly Ceremony[],tasks:DraftTask[]){
 return ceremonies.filter(c=>!c.is_archived).map(c=>{
  const retained=filterTasks(tasks,'',c.id);
  return {...c,progress:taskProgress(tasks,c.id),tasks:retained.map(t=>({...t,readiness:readiness(t,tasks)})),offlineOwners:[...new Set(retained.flatMap(t=>t.owner_name?[t.owner_name]:[]))]};
 });
}

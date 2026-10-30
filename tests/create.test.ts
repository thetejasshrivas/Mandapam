import test from 'node:test';
import assert from 'node:assert/strict';
import { ceremonyCatalog,parseSetup,parseTask,parseVersion,toPaise,toRupees,calendarDate,displayDate } from '../src/domain/create.ts';
test('budget uses exact paise text and keeps unknown distinct from zero',()=>{
  assert.equal(toPaise(''),null);assert.equal(toPaise('0'),'0');assert.equal(toPaise('00012.34'),'1234');
  assert.equal(toPaise('1000000000.00'),'100000000000');assert.equal(toRupees('1234'),'12.34');assert.equal(toRupees(null),'');
  for(const value of ['1.001','-1','1e5','1,000','1000000000.01',12])assert.throws(()=>toPaise(value));
});
test('calendar dates preserve date-only semantics without timezone conversion',()=>{
  assert.equal(calendarDate(''),'');assert.equal(calendarDate('2028-02-29'),'2028-02-29');assert.equal(displayDate('2027-02-14'),'14 Feb 2027');
  for(const value of ['2027-02-29','2027-04-31','2027-1-01','0000-01-01'])assert.throws(()=>calendarDate(value));
});
test('catalog is modular and custom ceremonies are validated rather than forced',()=>{
  assert.deepEqual(ceremonyCatalog.map(c=>c.title),['Roka/Engagement','Haldi','Mehendi','Sangeet','Wedding/Pheras','Reception']);
  const base={title:' Sample ',city:' Pune ',wedding_date:'',is_tentative:'on',budget:'',ceremonies:JSON.stringify([{title:'Wedding/Pheras',date:'',guest_count:''},{title:'Reception',date:'2027-02-15',guest_count:'250'}])};
  const result=parseSetup(base);assert.equal(result.ceremonies.length,2);assert.equal(result.ceremonies[0].guest_count,null);assert.equal(result.budget_ceiling_paise,null);assert.equal(result.title,'Sample');
  assert.equal(parseSetup({...base,ceremonies:JSON.stringify([{title:'Family gathering',date:'',guest_count:'1'}])}).ceremonies[0].title,'Family gathering');
  assert.throws(()=>parseSetup({...base,is_tentative:undefined}));
  assert.throws(()=>parseSetup({...base,ceremonies:'[]'}));
  assert.throws(()=>parseSetup({...base,owner_user_id:'forged'}));
  assert.throws(()=>parseSetup({...base,ceremonies:JSON.stringify([{title:'x',guest_count:'10001'}])}));
});
test('task inputs do not allow state, identity or prerequisite injection',()=>{
  assert.deepEqual(parseTask({title:' Sample task ',owner_name:'',description:'',due_date:''},false),{title:'Sample task',owner_name:null,description:null,due_date:null});
  assert.throws(()=>parseTask({title:'Sample',status:'COMPLETED'},false));
  assert.throws(()=>parseTask({title:'Sample',ceremony_id:'forged'},true));
  assert.throws(()=>parseTask({title:'x'.repeat(161)},false));
});
test('versions remain exact text beyond JavaScript integer precision',()=>{
  assert.equal(parseVersion('9007199254740993'),'9007199254740993');
  for(const value of [1,'01','-1','9223372036854775808'])assert.throws(()=>parseVersion(value));
});

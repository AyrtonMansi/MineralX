import test from 'node:test';import assert from 'node:assert/strict';
import {nextGoldAction,tankBalance,energySummary,blockers,localDay,taskDue,calendarMonthStart} from '../../lib/ops/workflow-model';
test('gold guidance is evidence-, lineage- and policy-aware rather than a fixed wizard',()=>{
 const d:any={record:{id:'lot-a',review_state:'unreviewed',form:'dore'},weights:[],assays:[]};
 assert.equal(nextGoldAction(d).key,'weight');d.weights=[{net_g:100}];assert.equal(nextGoldAction(d).key,'assay');
 d.assays=[{qualifier:'<',au_percent:90}];assert.equal(nextGoldAction(d).key,'assay');
 d.assays=[{qualifier:'=',au_percent:90}];assert.equal(nextGoldAction(d).key,'reviewGold');
 d.record.review_state='verified';assert.equal(nextGoldAction(d).key,null);
 assert.equal(nextGoldAction(d,{recognition_confirmed:true,recognition_form:'dore'}).key,'recognise');
 d.lineage=[{parent_id:'lot-a',child_id:'lot-b'}];assert.equal(nextGoldAction(d).title,'Historical physical lot');
});
test('fuel dip is independent and never overwrites the movement balance',()=>{
 const events=[{id:'1',kind:'opening',tank_id:'t',litres:'200',occurred_at:'2026-09-01'},
 {id:'2',kind:'delivery',tank_id:'t',litres:'500',occurred_at:'2026-09-02'},
 {id:'3',kind:'issue',tank_id:'t',litres:'100',occurred_at:'2026-09-03'},
 {id:'4',kind:'dip',tank_id:'t',litres:'590',occurred_at:'2026-09-04'}];
 assert.equal(tankBalance('t',events).balance,600);assert.equal(tankBalance('t',events).dip?.difference,-10);
 assert.equal(tankBalance('absent',events).balance,null);
});
test('interval totals exclude overlapping partial periods and never fabricate missing measurements',()=>{
 const r=[{kind:'solar_generation',amount:'25',started_at:'2026-09-01T00:00Z',ended_at:'2026-09-02T00:00Z'},
 {kind:'solar_generation',amount:'50',started_at:'2026-09-02T00:00Z',ended_at:'2026-09-03T00:00Z'}];
 const s=energySummary(r,'2026-09-01T00:00Z','2026-09-02T12:00Z');assert.equal(s.solar,25);assert.equal(s.partial,1);assert.equal(s.load,null);assert.equal(s.diesel,null);
});
test('a completed maintenance predecessor stays blocked until independently verified, including another scope',()=>{
 const d:any={dependencies:[{task_id:'t',predecessor_id:'p',kind:'maintenance',status:'resolved',verified:false}],tasks:[]};
 assert.equal(blockers({id:'t'},d).length,1);d.dependencies[0].verified=true;assert.equal(blockers({id:'t'},d).length,0);
 d.dependencies[0].status=null;assert.equal(blockers({id:'t'},d).length,1);
});
test('staff day and legacy due dates use the workspace timezone',()=>{
 assert.equal(localDay('Australia/Brisbane',new Date('2026-09-01T15:00Z')),'2026-09-02');
 assert.equal(taskDue({due_at:'2026-09-01T15:00Z'},'Australia/Brisbane'),'2026-09-02');
});

test('energy filter defaults are valid workspace calendar dates across month and year boundaries',()=>{
 assert.equal(calendarMonthStart('Australia/Brisbane',new Date('2026-09-09T02:00:00Z')),'2026-09-01');
 assert.equal(calendarMonthStart('Australia/Brisbane',new Date('2026-12-31T15:00:00Z')),'2027-01-01');
 assert.equal(calendarMonthStart('America/Los_Angeles',new Date('2026-09-01T00:30:00Z')),'2026-08-01');
});

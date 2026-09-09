import assert from 'node:assert/strict';
import test from 'node:test';
import {openProgramChoices,programChoices} from '../../lib/ops/workflow-model';

test('historical map choices retain closed program identities while new-entry choices stay open-only',()=>{
 const programs=[
  {recordId:'sampling-active',name:'Active sampling',state:'planned'},
  {recordId:'drilling-complete',name:'Completed drilling',state:'completed'},
  {data:{id:'mapping-cancelled',name:'Cancelled mapping',state:'cancelled'},id:'mapping-cancelled',version:4}
 ];
 assert.deepEqual(programChoices(programs).map((program:any)=>program.id),['sampling-active','drilling-complete','mapping-cancelled']);
 assert.deepEqual(openProgramChoices(programs).map((program:any)=>program.id),['sampling-active']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProducts,validateEdit} from '../dist/catalog.js';

test('a fitted men’s training search respects all filters together',()=>{
 assert.deepEqual(selectProducts({category:'Move',wearer:'Men',fit:'Fitted',query:' carbon '}).map(p=>p.id),['form-training-tee']);
 assert.deepEqual(selectProducts({category:'Utility',wearer:'Men',fit:'Oversized'}),[]);
});
test('restored edits discard stale IDs, invalid sizes and duplicate variants',()=>{
 assert.deepEqual(validateEdit([null,{}, {id:'deleted-piece',size:'M'}, {id:'everyday-tee',size:'invalid'}, {id:'everyday-tee',size:'M',price:123}, {id:'everyday-tee',size:'M'}, {id:'everyday-tee',size:'L'}]),[{id:'everyday-tee',size:'M'},{id:'everyday-tee',size:'L'}]);
 assert.deepEqual(validateEdit({malformed:true}),[]);
});
test('an undecided size survives serialisation without becoming an order',()=>{
 const original=[{id:'field-trouser',size:'Undecided'}];
 assert.deepEqual(validateEdit(JSON.parse(JSON.stringify(original))),original);
 assert.equal(selectProducts({query:'<img onerror=alert(1)>'}).length,0);
});

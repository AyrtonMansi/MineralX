import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlantPage from '../../app/plant/page';
import data from '../../data/plant-p5.json';
import {plantSchema} from '../../lib/plant/model';
import {proxyPlantNotes} from '../../lib/plant/notes-proxy';

test('the public page renders the full corrected plan without credentials or a database import',()=>{
 const html=renderToStaticMarkup(React.createElement(PlantPage));
 assert.match(html,/data-equipment-id="SC01"/);assert.match(html,/0.8 mm screen/);
 assert.doesNotMatch(html,/data-equipment-id="DW01"|Sign in|awaiting import/);
 assert.match(html,/CV02 · \+0.8 mm conveyor/);assert.match(html,/data-equipment-id="RJ01"/);
 const model=plantSchema.parse(data);const cv=model.streams.find(s=>s.id==='CV02')!;
 assert.equal(cv.source,'SC01');assert.equal(cv.target,'VS01');assert.equal(cv.route_type,'conveyor');
 assert.equal(model.equipment.filter(q=>q.id.startsWith('RJ')).length,1);
 assert.ok(!model.streams.some(s=>s.source==='DW01'||s.target==='DW01'));
});
test('notes proxy forwards only the plant credential and relays the reviewer cookie',async()=>{
 const cookie='mx_plant_reviewer='+'a'.repeat(64);
 const res=await proxyPlantNotes(new Request('https://mineral-x.com.au/api/plant/notes',{headers:{cookie:'sb-private=secret; '+cookie+'; other=private'}}),async(url,init)=>{
   assert.equal(String(url),'https://josephine-plant-review.mineralx.chatgpt.site/api/notes');
   const headers=new Headers(init?.headers);assert.equal(headers.get('cookie'),cookie);assert.equal(headers.get('authorization'),null);
   return new Response('{"notes":[],"next":null}',{headers:{'content-type':'application/json','set-cookie':cookie+'; Path=/; HttpOnly; Secure; SameSite=Lax'}});
 });
 assert.equal(res.status,200);assert.match(res.headers.get('set-cookie')!,/HttpOnly/);assert.match(res.headers.get('cache-control')!,/no-store/);
});
test('cross-origin writes are rejected before forwarding; upstream failures preserve a recoverable response',async()=>{
 const denied=await proxyPlantNotes(new Request('https://mineral-x.com.au/api/plant/notes',{method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:'{}'}),async()=>{throw new Error('must not forward');});
 assert.equal(denied.status,403);
 const failed=await proxyPlantNotes(new Request('https://mineral-x.com.au/api/plant/notes'),async()=>{throw new Error('timeout');});
 assert.equal(failed.status,503);assert.match((await failed.json()).error,/draft is kept/);
});

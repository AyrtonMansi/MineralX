import test from 'node:test';
import assert from 'node:assert/strict';
import type {Equipment} from '../../lib/plant/model';
import {equipmentRenderProfile} from '../../lib/plant/equipment-model';

function equipment(basis:string):Equipment{return {id:'SC01',name:'DD2412R vibrating screen',x:0,y:0,w:3,h:2.7,group:'wet',basis,note:'',symbol:[{points:[[0,0],[3,0],[3,2.7],[0,2.7],[0,0]],fill:true}],geographic:[[143,-19],[143.00001,-19],[143.00001,-18.99999],[143,-18.99999],[143,-19]]};}

test('controlled OEM reference basis is retained as vendor-reference authority',()=>{
 const profile=equipmentRenderProfile(equipment('OEM reference'));
 assert.equal(profile.modelStatus,'vendor_reference');
 assert.equal(profile.source,'basis');
 assert.match(profile.rationale,/controlled P5 equipment basis/);
});

test('plain allowances remain inferred even when the renderer can build a detailed assembly',()=>{
 const profile=equipmentRenderProfile(equipment('Allowance'));
 assert.equal(profile.modelStatus,'inferred');
 assert.equal(profile.source,'inferred');
});

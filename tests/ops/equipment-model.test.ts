import test from 'node:test';
import assert from 'node:assert/strict';
import type {Equipment} from '../../lib/plant/model';
import {equipmentRenderProfile,inferEquipmentArchetype} from '../../lib/plant/equipment-model';

function equipment(id:string,name:string,w=3,h=2):Equipment{return {id,name,x:0,y:0,w,h,group:'wet',basis:'test basis',note:'',symbol:[{points:[[0,0],[w,0],[w,h],[0,h],[0,0]],fill:true}],geographic:[[143,-19],[143.00001,-19],[143.00001,-18.99999],[143,-18.99999],[143,-19]]};}

test('gravity circuit names map to functional equipment archetypes',()=>{
 const cases:[string,string,string][]=[
  ['JG01','Gekko IPJ1000','inline_pressure_jig'],
  ['J3','Russell J3 jig','jig'],
  ['FC01','Falcon SB400','centrifugal_concentrator'],
  ['KB1','Knudsen bowl 1','knudsen_bowl'],
  ['SL1','Sluice','sluice'],
  ['ST1','Shaker table','shaker_table'],
  ['SP1','Spiral concentrator','spiral_concentrator'],
  ['VSI','VSI crusher','vertical_impact_crusher'],
  ['HC','Hammer crusher','hammer_crusher'],
  ['SCR','Vibrating screen','vibrating_screen'],
 ];
 for(const [id,name,expected] of cases)assert.equal(inferEquipmentArchetype(equipment(id,name)),expected,`${name} should map to ${expected}`);
});

test('expert-reasoned gravity models expose useful parametric geometry but remain inferred',()=>{
 const ipj=equipmentRenderProfile(equipment('JG01','Gekko IPJ1000',1.4,1.4));
 assert.equal(ipj.archetype,'inline_pressure_jig');
 assert.ok(ipj.dimensions.pressure_vessel_diameter_m>0);
 const jig=equipmentRenderProfile(equipment('J3','Russell J3 jig',2.2,1.6));
 assert.equal(jig.modelStatus,'inferred');
 assert.equal(jig.dimensions.cell_count,2);
 assert.ok(jig.dimensions.deck_height_m>0);
 const falcon=equipmentRenderProfile(equipment('FC01','Falcon SB400',2,2));
 assert.equal(falcon.archetype,'centrifugal_concentrator');
 assert.ok(falcon.dimensions.bowl_housing_diameter_m>0);
 const table=equipmentRenderProfile(equipment('ST1','Shaker table',3.2,1.6));
 assert.equal(table.archetype,'shaker_table');
 assert.ok(table.dimensions.deck_length_m>table.dimensions.deck_width_m);
 const spiral=equipmentRenderProfile(equipment('SP1','Spiral concentrator',1.8,1.8));
 assert.ok(spiral.dimensions.turns>=5);
 assert.ok(spiral.heightM>2);
});

test('verified engineering parameters override inference without changing stable identity',()=>{
 const base=equipment('KB1','Knudsen bowl 1',2,2);
 const configured:Equipment={...base,engineering:{archetype:'knudsen_bowl',model_status:'vendor_reference',overall_height_m:2.15,rotation_deg:90,dimensions:{bowl_diameter_m:.92},specification:[{key:'model',value:'Vendor reference example',basis:'verified source'}]}};
 const profile=equipmentRenderProfile(configured);
 assert.equal(configured.id,'KB1');
 assert.equal(profile.modelStatus,'vendor_reference');
 assert.equal(profile.heightM,2.15);
 assert.equal(profile.rotationDeg,90);
 assert.equal(profile.dimensions.bowl_diameter_m,.92);
});

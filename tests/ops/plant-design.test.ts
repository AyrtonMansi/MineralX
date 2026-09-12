import test from 'node:test';
import assert from 'node:assert/strict';
import {plantSchema} from '../../lib/plant/model';
import {applyPlantDesignOperations,compactPlantModel,plantModelFingerprint} from '../../lib/plant/design';

const base=plantSchema.parse({
 revision:'T1',title:'Test plant',subtitle:'Engineering test',status:'concept',width:30,height:20,
 georeference:{origin_WGS84:[143,-19],metres_per_longitude_degree:105000,metres_per_latitude_degree:111000,heading_degrees:0},
 annotations:[],layout_reasoning:[],view_presets:{all:{x:0,y:0,w:30,h:20}},translation_from_P1_m:[0,0],yard_centre_WGS84:[143,-19],
 equipment:[
  {id:'A',name:'Crusher',x:2,y:2,w:3,h:2,group:'feed',basis:'test',note:'',symbol:[{points:[[2,2],[5,2],[5,4],[2,4],[2,2]],fill:true}],label:['Crusher',3.5,3],geographic:[[143,-19],[143.00002857,-19],[143.00002857,-18.99998198],[143,-18.99998198],[143,-19]]},
  {id:'B',name:'Jig',x:14,y:8,w:3,h:3,group:'wet',basis:'test',note:'',symbol:[{points:[[14,8],[17,8],[17,11],[14,11],[14,8]],fill:true}],label:['Jig',15.5,9.5],geographic:[[143.00013333,-18.99992793],[143.0001619,-18.99992793],[143.0001619,-18.9999009],[143.00013333,-18.9999009],[143.00013333,-18.99992793]]},
 ],
 streams:[{id:'S1',source:'A',target:'B',kind:'wet',points:[[5,3],[9,3],[14,9.5]],geographic:[[143.00004762,-18.99999099],[143.00008571,-18.99999099],[143.00013333,-18.99991441]],note:'',route_type:'conveyor',horizontal_route_m:12,label:['S1',9,3]}],
 roads:[],zones:[],lease:[[0,0],[30,0],[30,20],[0,20],[0,0]],yard_geographic:[[143,-19],[143.00028571,-19],[143.00028571,-18.99981982],[143,-18.99981982],[143,-19]],
 traces:[{id:'flow',name:'Flow',description:'test',streams:['S1']}],holds:[],source_links:[],
});

test('moving equipment moves its attached route endpoint and keeps the model valid',()=>{
 const result=applyPlantDesignOperations(base,[{type:'move_equipment',equipmentId:'A',x:6,y:2}]);
 assert.equal(result.validation.ok,true);
 const moved=result.model.equipment.find(e=>e.id==='A')!;
 assert.equal(moved.x,6);
 assert.deepEqual(result.model.streams[0].points[0],[9,3]);
 assert.deepEqual(result.validation.affectedEquipment,['A']);
 assert.deepEqual(result.validation.affectedStreams,['S1']);
 assert.notEqual(plantModelFingerprint(result.model),plantModelFingerprint(base));
});

test('relative movement maps directly from conversational east west north south instructions',()=>{
 const result=applyPlantDesignOperations(base,[{type:'translate_equipment',equipmentId:'B',dx:2,dy:-1}]);
 assert.equal(result.validation.ok,true);
 const moved=result.model.equipment.find(e=>e.id==='B')!;
 assert.deepEqual([moved.x,moved.y],[16,7]);
 assert.deepEqual(result.model.streams[0].points.at(-1),[16,8.5]);
});

test('a proposed collision is blocked before persistence',()=>{
 const result=applyPlantDesignOperations(base,[{type:'move_equipment',equipmentId:'A',x:14,y:8}]);
 assert.equal(result.validation.ok,false);
 assert.ok(result.validation.issues.some(issue=>issue.code==='equipment_overlap'));
});

test('concept equipment can be added with a stable semantic identity',()=>{
 const result=applyPlantDesignOperations(base,[{type:'add_equipment',equipmentId:'C',name:'Knudsen bowl',group:'con',x:22,y:3,width:2,height:2,basis:'concept allowance',note:'chat proposal'}]);
 assert.equal(result.validation.ok,true);
 assert.equal(result.model.equipment.find(e=>e.id==='C')?.name,'Knudsen bowl');
 const compact=compactPlantModel(result.model);
 assert.equal(compact.equipment.some(e=>e.id==='C'),true);
 assert.match(compact.fingerprint,/^T1:/);
});

test('unknown design targets fail closed',()=>{
 assert.throws(()=>applyPlantDesignOperations(base,[{type:'move_equipment',equipmentId:'NOPE',x:1,y:1}]),/RULE: Equipment NOPE was not found/);
});

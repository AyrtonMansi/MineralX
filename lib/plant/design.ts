import {z} from 'zod';
import {equipmentArchetypeSchema,equipmentModelStatusSchema,plantSchema, type PlantModel, type Equipment} from './model';
import {equipmentRenderSummary} from './equipment-model';

const coordinate = z.number().finite().min(-10000).max(10000);
const delta = z.number().finite().min(-1000).max(1000);
const dimension = z.number().finite().positive().max(1000);
const pointSchema = z.tuple([coordinate, coordinate]);
const equipmentIdSchema = z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const equipmentGroupSchema = z.enum(['feed','wet','recirc','con','tail','service']);
const specificationSchema=z.array(z.object({
  key:z.string().trim().min(1).max(100),value:z.string().trim().min(1).max(300),unit:z.string().trim().max(40).optional(),basis:z.string().trim().max(240).optional(),
}).strict()).max(60);
const engineeringConfigSchema=z.object({
  archetype:equipmentArchetypeSchema.optional(),
  modelStatus:equipmentModelStatusSchema.optional(),
  overallHeightM:z.number().finite().positive().max(60).optional(),
  rotationDeg:z.number().finite().min(-360).max(360).optional(),
  dimensions:z.record(z.string().max(80),z.number().finite().nonnegative().max(2000)).optional(),
  specification:specificationSchema.optional(),
}).strict().refine(value=>Object.keys(value).length>0,'Provide at least one equipment engineering parameter.');

export const plantDesignOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move_equipment'),
    equipmentId: equipmentIdSchema,
    x: coordinate.describe('New west-edge X coordinate in metres in the P5 plant-yard coordinate system.'),
    y: coordinate.describe('New south-edge Y coordinate in metres in the P5 plant-yard coordinate system.'),
  }).strict(),
  z.object({
    type: z.literal('translate_equipment'),
    equipmentId: equipmentIdSchema,
    dx: delta.describe('Relative east/west movement in metres. Positive is east; negative is west.'),
    dy: delta.describe('Relative north/south movement in metres. Positive is north; negative is south.'),
  }).strict(),
  z.object({
    type: z.literal('resize_equipment'),
    equipmentId: equipmentIdSchema,
    width: dimension.describe('New planning-envelope width in metres. The equipment centre is preserved.'),
    height: dimension.describe('New planning-envelope depth in metres. The equipment centre is preserved.'),
  }).strict(),
  z.object({
    type:z.literal('configure_equipment'),
    equipmentId:equipmentIdSchema,
    engineering:engineeringConfigSchema.describe('Parametric 3D equipment model settings. Use inferred status for expert-reasoned geometry unless a verified source supports specified/vendor/as-built dimensions.'),
  }).strict(),
  z.object({
    type: z.literal('reroute_stream'),
    streamId: z.string().trim().min(1).max(80),
    points: z.array(pointSchema).min(2).max(80).describe('Ordered local-yard X/Y route points in metres.'),
  }).strict(),
  z.object({
    type: z.literal('add_equipment'),
    equipmentId: equipmentIdSchema,
    name: z.string().trim().min(2).max(160),
    group: equipmentGroupSchema,
    x: coordinate,
    y: coordinate,
    width: dimension,
    height: dimension,
    basis: z.string().trim().min(2).max(200).default('ChatGPT design proposal'),
    note: z.string().trim().max(3000).default(''),
    engineering:engineeringConfigSchema.optional(),
  }).strict(),
]);

export const plantDesignOperationsSchema = z.array(plantDesignOperationSchema).min(1).max(50);
export type PlantDesignOperation = z.infer<typeof plantDesignOperationSchema>;
export type PlantDesignIssue = {severity:'error'|'warning';code:string;message:string;targetId?:string};
export type PlantDesignValidation = {
  ok:boolean;
  issues:PlantDesignIssue[];
  affectedEquipment:string[];
  affectedStreams:string[];
};

const round = (value:number, places=4) => Number(value.toFixed(places));
const rectangle = (x:number,y:number,w:number,h:number):[number,number][] => [[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const geoPoint = (model:PlantModel, point:[number,number]):[number,number] => [
  model.georeference.origin_WGS84[0] + point[0] / model.georeference.metres_per_longitude_degree,
  model.georeference.origin_WGS84[1] + point[1] / model.georeference.metres_per_latitude_degree,
];
const geoPoints = (model:PlantModel, points:[number,number][]) => points.map(point=>geoPoint(model,point));
const routeLength = (points:[number,number][]) => round(points.slice(1).reduce((total,point,index)=>{
  const prior=points[index];return total+Math.hypot(point[0]-prior[0],point[1]-prior[1]);
},0),2);

function semanticSnapshot(model:PlantModel){
  return {
    revision:model.revision,width:model.width,height:model.height,
    equipment:model.equipment.map(e=>({id:e.id,x:e.x,y:e.y,w:e.w,h:e.h,group:e.group,engineering:e.engineering||null})).sort((a,b)=>a.id.localeCompare(b.id)),
    streams:model.streams.map(s=>({id:s.id,source:s.source,target:s.target,kind:s.kind,route_type:s.route_type,points:s.points})).sort((a,b)=>a.id.localeCompare(b.id)),
  };
}

/** Deterministic non-secret identity used for optimistic design concurrency, not cryptographic security. */
export function plantModelFingerprint(model:PlantModel){
  const text=JSON.stringify(semanticSnapshot(model));
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    a^=c;a=Math.imul(a,0x01000193)>>>0;
    b^=(c+i)&0xffff;b=Math.imul(b,0x85ebca6b)>>>0;b^=b>>>13;
  }
  return `${model.revision}:${a.toString(16).padStart(8,'0')}${b.toString(16).padStart(8,'0')}`;
}

export function compactPlantModel(model:PlantModel){
  return {
    revision:model.revision,
    fingerprint:plantModelFingerprint(model),
    title:model.title,
    status:model.status,
    yard:{width:model.width,height:model.height,coordinateSystem:'local metres; X east, Y north'},
    equipment:model.equipment.map(e=>({id:e.id,name:e.name,group:e.group,x:e.x,y:e.y,width:e.w,height:e.h,basis:e.basis,note:e.note,renderModel:equipmentRenderSummary(e),engineering:e.engineering||null})),
    streams:model.streams.map(s=>({id:s.id,source:s.source,target:s.target,kind:s.kind,routeType:s.route_type,points:s.points,horizontalRouteM:s.horizontal_route_m,note:s.note})),
    holds:model.holds,
    traces:model.traces,
  };
}

function translateEquipment(model:PlantModel,equipment:Equipment,newX:number,newY:number){
  const dx=newX-equipment.x,dy=newY-equipment.y;
  equipment.x=round(newX);equipment.y=round(newY);
  equipment.symbol=equipment.symbol.map(symbol=>({...symbol,points:symbol.points.map(point=>[round(point[0]+dx),round(point[1]+dy)] as [number,number])}));
  if(equipment.label)equipment.label=[equipment.label[0],round(equipment.label[1]+dx),round(equipment.label[2]+dy)];
  equipment.geographic=equipment.geographic.map(point=>[
    point[0]+dx/model.georeference.metres_per_longitude_degree,
    point[1]+dy/model.georeference.metres_per_latitude_degree,
  ] as [number,number]);
  for(const stream of model.streams){
    let changed=false;
    const points=stream.points.map(point=>[point[0],point[1]] as [number,number]);
    if(stream.source===equipment.id){points[0]=[round(points[0][0]+dx),round(points[0][1]+dy)];changed=true;}
    if(stream.target===equipment.id){const last=points.length-1;points[last]=[round(points[last][0]+dx),round(points[last][1]+dy)];changed=true;}
    if(changed){stream.points=points;stream.geographic=geoPoints(model,points);stream.horizontal_route_m=routeLength(points);}
  }
}

function resizeEquipment(model:PlantModel,equipment:Equipment,width:number,height:number){
  const oldW=equipment.w,oldH=equipment.h,cx=equipment.x+oldW/2,cy=equipment.y+oldH/2;
  const nextX=cx-width/2,nextY=cy-height/2,sx=width/oldW,sy=height/oldH;
  equipment.symbol=equipment.symbol.map(symbol=>({...symbol,points:symbol.points.map(point=>[
    round(cx+(point[0]-cx)*sx),round(cy+(point[1]-cy)*sy),
  ] as [number,number])}));
  equipment.x=round(nextX);equipment.y=round(nextY);equipment.w=round(width);equipment.h=round(height);
  equipment.geographic=geoPoints(model,rectangle(equipment.x,equipment.y,equipment.w,equipment.h));
}

function applyEngineeringConfig(equipment:Equipment,engineering:z.infer<typeof engineeringConfigSchema>){
  const current=equipment.engineering,renderBefore=equipmentRenderSummary(equipment);
  equipment.engineering={
    archetype:engineering.archetype||current?.archetype||renderBefore.archetype,
    model_status:engineering.modelStatus||current?.model_status||renderBefore.modelStatus,
    ...(engineering.overallHeightM!==undefined||current?.overall_height_m!==undefined?{overall_height_m:engineering.overallHeightM??current?.overall_height_m}:{}),
    ...(engineering.rotationDeg!==undefined||current?.rotation_deg!==undefined?{rotation_deg:engineering.rotationDeg??current?.rotation_deg}:{}),
    ...((engineering.dimensions||current?.dimensions)?{dimensions:{...(current?.dimensions||{}),...(engineering.dimensions||{})}}:{}),
    ...((engineering.specification||current?.specification)?{specification:engineering.specification||current?.specification}:{}),
  };
}

function addEquipment(model:PlantModel,operation:Extract<PlantDesignOperation,{type:'add_equipment'}>){
  const points=rectangle(operation.x,operation.y,operation.width,operation.height);
  const equipment:Equipment={
    id:operation.equipmentId,name:operation.name,x:round(operation.x),y:round(operation.y),w:round(operation.width),h:round(operation.height),
    group:operation.group,basis:operation.basis,note:operation.note,
    symbol:[{points,fill:true}],label:[operation.name,round(operation.x+operation.width/2),round(operation.y+operation.height/2)],
    geographic:geoPoints(model,points),
  };
  if(operation.engineering)applyEngineeringConfig(equipment,operation.engineering);
  model.equipment.push(equipment);
}

function overlaps(a:Equipment,b:Equipment){
  const ix=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),iy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
  return ix>0.01&&iy>0.01;
}

function validateModel(model:PlantModel,affectedEquipment:Set<string>,affectedStreams:Set<string>):PlantDesignValidation{
  const issues:PlantDesignIssue[]=[];
  for(const equipment of model.equipment){
    if(equipment.x<0||equipment.y<0||equipment.x+equipment.w>model.width||equipment.y+equipment.h>model.height){
      issues.push({severity:'error',code:'equipment_outside_yard',targetId:equipment.id,message:`${equipment.id} extends outside the ${model.width} × ${model.height} m plant yard.`});
    }
    if(affectedEquipment.has(equipment.id)){
      const render=equipmentRenderSummary(equipment);
      if(render.modelStatus==='inferred')issues.push({severity:'warning',code:'equipment_geometry_inferred',targetId:equipment.id,message:`${equipment.id} uses expert-inferred ${render.archetype.replaceAll('_',' ')} geometry. Confirm vendor or field dimensions before treating it as specified or as-built.`});
      else if(render.source==='basis')issues.push({severity:'warning',code:'equipment_geometry_partially_inferred',targetId:equipment.id,message:`${equipment.id} has ${render.modelStatus.replaceAll('_',' ')} authority in the P5 basis, but unrecorded 3D dimensions still use conservative parametric geometry. Add verified dimensions before relying on exact clearances or connection elevations.`});
    }
  }
  for(let i=0;i<model.equipment.length;i++)for(let j=i+1;j<model.equipment.length;j++){
    const a=model.equipment[i],b=model.equipment[j];
    if(overlaps(a,b)&&(affectedEquipment.has(a.id)||affectedEquipment.has(b.id))){
      issues.push({severity:'error',code:'equipment_overlap',targetId:`${a.id}:${b.id}`,message:`${a.id} overlaps ${b.id}. Revise the proposed envelopes before review.`});
    }
  }
  const ids=new Set(model.equipment.map(e=>e.id));
  for(const stream of model.streams){
    if(!ids.has(stream.source)||!ids.has(stream.target))issues.push({severity:'error',code:'route_endpoint_missing',targetId:stream.id,message:`${stream.id} references equipment that is not present in the proposed model.`});
    if(affectedStreams.has(stream.id)&&stream.points.some(point=>point[0]<0||point[1]<0||point[0]>model.width||point[1]>model.height)){
      issues.push({severity:'error',code:'route_outside_yard',targetId:stream.id,message:`${stream.id} contains a route point outside the plant yard.`});
    }
  }
  return {ok:!issues.some(issue=>issue.severity==='error'),issues,affectedEquipment:[...affectedEquipment].sort(),affectedStreams:[...affectedStreams].sort()};
}

export function applyPlantDesignOperations(base:PlantModel,input:unknown){
  const operations=plantDesignOperationsSchema.parse(input);
  const model=structuredClone(base) as PlantModel,affectedEquipment=new Set<string>(),affectedStreams=new Set<string>();
  for(const operation of operations){
    if(operation.type==='add_equipment'){
      if(model.equipment.some(e=>e.id===operation.equipmentId))throw new Error(`RULE: Equipment ${operation.equipmentId} already exists.`);
      addEquipment(model,operation);affectedEquipment.add(operation.equipmentId);continue;
    }
    if(operation.type==='reroute_stream'){
      const stream=model.streams.find(candidate=>candidate.id===operation.streamId);
      if(!stream)throw new Error(`RULE: Process route ${operation.streamId} was not found in ${base.revision}.`);
      const points=operation.points.map(point=>[round(point[0]),round(point[1])] as [number,number]);
      stream.points=points;stream.geographic=geoPoints(model,points);stream.horizontal_route_m=routeLength(points);affectedStreams.add(stream.id);continue;
    }
    const equipment=model.equipment.find(candidate=>candidate.id===operation.equipmentId);
    if(!equipment)throw new Error(`RULE: Equipment ${operation.equipmentId} was not found in ${base.revision}.`);
    const connected=model.streams.filter(stream=>stream.source===equipment.id||stream.target===equipment.id).map(stream=>stream.id);
    if(operation.type==='move_equipment')translateEquipment(model,equipment,operation.x,operation.y);
    else if(operation.type==='translate_equipment')translateEquipment(model,equipment,equipment.x+operation.dx,equipment.y+operation.dy);
    else if(operation.type==='resize_equipment')resizeEquipment(model,equipment,operation.width,operation.height);
    else applyEngineeringConfig(equipment,operation.engineering);
    affectedEquipment.add(equipment.id);connected.forEach(id=>affectedStreams.add(id));
  }
  const parsed=plantSchema.parse(model),validation=validateModel(parsed,affectedEquipment,affectedStreams);
  return {model:parsed,operations,validation};
}

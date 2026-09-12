import * as THREE from 'three';
import type {Equipment,PlantModel} from '@/lib/plant/model';
import {palette} from '@/lib/plant/model';
import {equipmentRenderProfile,type EquipmentRenderProfile} from '@/lib/plant/equipment-model';

const steel=new THREE.Color('#7c8783');
const darkSteel=new THREE.Color('#48534f');
const lightSteel=new THREE.Color('#c8cfcc');

function material(hex:THREE.Color|string,roughness=.68,metalness=.16){return new THREE.MeshStandardMaterial({color:hex instanceof THREE.Color?hex:new THREE.Color(hex),roughness,metalness});}
function groupMaterial(equipment:Equipment){return new THREE.Color(palette[equipment.group]||'#66756f');}
function tag(mesh:THREE.Object3D,equipmentId:string){mesh.userData.equipmentId=equipmentId;return mesh;}
function addBox(group:THREE.Group,equipmentId:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material,rotationZ=0,rotationX=0){
 const mesh=tag(new THREE.Mesh(new THREE.BoxGeometry(Math.max(.03,w),Math.max(.03,h),Math.max(.03,d)),mat),equipmentId) as THREE.Mesh;mesh.position.set(x,y,z);mesh.rotation.z=rotationZ;mesh.rotation.x=rotationX;group.add(mesh);return mesh;
}
function addCylinder(group:THREE.Group,equipmentId:string,radius:number,height:number,x:number,y:number,z:number,mat:THREE.Material,radial=24,rotationZ=0){
 const mesh=tag(new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.02,radius),Math.max(.02,radius),Math.max(.03,height),radial),mat),equipmentId) as THREE.Mesh;mesh.position.set(x,y,z);mesh.rotation.z=rotationZ;group.add(mesh);return mesh;
}
function addCone(group:THREE.Group,equipmentId:string,topRadius:number,bottomRadius:number,height:number,x:number,y:number,z:number,mat:THREE.Material,radial=24){
 const mesh=tag(new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.02,topRadius),Math.max(.02,bottomRadius),Math.max(.03,height),radial),mat),equipmentId) as THREE.Mesh;mesh.position.set(x,y,z);group.add(mesh);return mesh;
}
function addLegs(group:THREE.Group,equipmentId:string,w:number,d:number,height:number,mat:THREE.Material,inset=.16){
 const leg=.08+Math.min(w,d)*.035,dx=Math.max(.15,w/2-leg-inset),dz=Math.max(.15,d/2-leg-inset);
 for(const x of [-dx,dx])for(const z of [-dz,dz])addBox(group,equipmentId,leg,height,leg,x,height/2,z,mat);
}
function addEdgeOutline(group:THREE.Group,mesh:THREE.Mesh){
 const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,24),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.34}));edges.position.copy(mesh.position);edges.rotation.copy(mesh.rotation);edges.scale.copy(mesh.scale);group.add(edges);
}

function buildStockpile(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 addBox(group,e.id,e.w+.12,.1,e.h+.12,0,.05,0,frame);
 const mound=tag(new THREE.Mesh(new THREE.ConeGeometry(Math.max(.5,Math.min(e.w,e.h)*.48),p.heightM,40),body),e.id) as THREE.Mesh;mound.position.y=p.heightM/2;group.add(mound);
}
function buildHopper(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const legH=p.heightM*.32;addLegs(group,e.id,e.w*.8,e.h*.8,legH,frame);
 const upper=addBox(group,e.id,e.w*.82,p.heightM*.24,e.h*.82,0,legH+p.heightM*.42,0,body);addEdgeOutline(group,upper);
 const funnel=tag(new THREE.Mesh(new THREE.ConeGeometry(Math.min(e.w,e.h)*.43,p.heightM*.42,4),body),e.id) as THREE.Mesh;funnel.position.y=legH+p.heightM*.18;funnel.rotation.y=Math.PI/4;funnel.rotation.z=Math.PI;group.add(funnel);
 addBox(group,e.id,Math.max(.24,e.w*.18),p.heightM*.12,Math.max(.24,e.h*.18),0,legH*.72,0,frame);
}
function buildCrusher(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const baseH=.18,bodyH=p.heightM*.44,hopperH=p.heightM*.32;addBox(group,e.id,e.w*.9,baseH,e.h*.82,0,baseH/2,0,frame);
 addLegs(group,e.id,e.w*.7,e.h*.65,p.heightM*.16,frame,.08);
 const crusher=addBox(group,e.id,e.w*.62,bodyH,e.h*.62,0,p.heightM*.16+bodyH/2,0,body);addEdgeOutline(group,crusher);
 const hopper=tag(new THREE.Mesh(new THREE.ConeGeometry(Math.min(e.w,e.h)*.36,hopperH,4),body),e.id) as THREE.Mesh;hopper.position.set(0,p.heightM*.16+bodyH+hopperH/2,0);hopper.rotation.y=Math.PI/4;group.add(hopper);
 const motor=addCylinder(group,e.id,Math.max(.12,Math.min(e.w,e.h)*.12),Math.max(.4,e.w*.28),e.w*.34,p.heightM*.26,e.h*.28,material(darkSteel,.5,.45),20,Math.PI/2);motor.rotation.x=Math.PI/2;
 addBox(group,e.id,e.w*.26,p.heightM*.18,e.h*.18,-e.w*.34,p.heightM*.22,0,frame);
}
function buildScreen(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const frameH=p.heightM*.38,slope=THREE.MathUtils.degToRad(p.dimensions.deck_slope_deg||8);addLegs(group,e.id,e.w*.82,e.h*.72,frameH,frame);
 const deck=addBox(group,e.id,e.w*.84,p.heightM*.16,e.h*.68,0,frameH+p.heightM*.2,0,body,slope);addEdgeOutline(group,deck);
 addBox(group,e.id,e.w*.78,.04,e.h*.58,0,frameH+p.heightM*.3,0,material(lightSteel,.8,.08),slope);
 addBox(group,e.id,e.w*.2,p.heightM*.24,e.h*.55,-e.w*.37,frameH+p.heightM*.3,0,frame,slope);
 addBox(group,e.id,e.w*.16,p.heightM*.2,e.h*.5,e.w*.4,frameH+p.heightM*.12,0,frame,slope);
}
function buildJig(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const frameH=p.heightM*.22,tankH=p.heightM*.48,cellGap=Math.max(.04,e.w*.035),cellW=(e.w*.78-cellGap)/2;addLegs(group,e.id,e.w*.84,e.h*.78,frameH,frame,.07);
 addBox(group,e.id,e.w*.9,.1,e.h*.85,0,frameH-.05,0,frame);
 for(const x of [-(cellW+cellGap)/2,(cellW+cellGap)/2]){
  const tank=addBox(group,e.id,cellW,tankH,e.h*.7,x,frameH+tankH/2,0,body);addEdgeOutline(group,tank);
  addBox(group,e.id,cellW*.84,.06,e.h*.56,x,frameH+tankH*.58,0,material(lightSteel,.78,.04));
 }
 addBox(group,e.id,e.w*.88,p.heightM*.08,e.h*.22,0,frameH+tankH+p.heightM*.04,e.h*.32,frame);
 addCylinder(group,e.id,Math.max(.08,e.w*.045),Math.max(.3,e.h*.44),0,frameH+tankH*.58,-e.h*.44,material(darkSteel,.52,.4),16,Math.PI/2);
 addBox(group,e.id,e.w*.24,p.heightM*.18,e.h*.18,e.w*.35,frameH+tankH*.58,-e.h*.35,frame);
}
function buildBowl(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const frameH=p.heightM*.42,r=Math.max(.22,Math.min(e.w,e.h)*.31);addLegs(group,e.id,e.w*.66,e.h*.66,frameH,frame,.05);addBox(group,e.id,e.w*.74,.1,e.h*.74,0,frameH-.05,0,frame);
 const shell=addCylinder(group,e.id,r,p.heightM*.38,0,frameH+p.heightM*.19,0,body,32);addEdgeOutline(group,shell);
 const bowl=tag(new THREE.Mesh(new THREE.CylinderGeometry(r*.85,r*.35,p.heightM*.3,32,1,true),material(lightSteel,.38,.4)),e.id) as THREE.Mesh;bowl.position.y=frameH+p.heightM*.21;group.add(bowl);
 addCylinder(group,e.id,r*.11,p.heightM*.26,0,frameH+p.heightM*.52,0,frame,18);
 addBox(group,e.id,e.w*.28,p.heightM*.16,e.h*.22,e.w*.31,p.heightM*.18,0,frame);
}
function buildCyclone(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const legH=p.heightM*.24,r=Math.max(.2,Math.min(e.w,e.h)*.27),coneH=p.heightM*.46,barrelH=p.heightM*.26;addLegs(group,e.id,e.w*.62,e.h*.62,legH,frame,.04);
 const cone=addCone(group,e.id,r*.12,r,coneH,0,legH+coneH/2,0,body,28);addEdgeOutline(group,cone);
 const barrel=addCylinder(group,e.id,r,barrelH,0,legH+coneH+barrelH/2,0,body,28);addEdgeOutline(group,barrel);
 addCylinder(group,e.id,r*.18,p.heightM*.22,0,legH+coneH+barrelH+p.heightM*.11,0,frame,18);
 addCylinder(group,e.id,r*.12,Math.max(.35,e.w*.42),e.w*.28,legH+coneH+barrelH*.65,0,frame,16,Math.PI/2);
}
function buildTank(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const r=Math.max(.25,Math.min(e.w,e.h)*.39),shellH=p.heightM*.88;addBox(group,e.id,e.w*.9,.1,e.h*.9,0,.05,0,frame);
 const shell=addCylinder(group,e.id,r,shellH,0,.1+shellH/2,0,body,40);addEdgeOutline(group,shell);
 const roof=tag(new THREE.Mesh(new THREE.ConeGeometry(r*.98,p.heightM*.12,40),body),e.id) as THREE.Mesh;roof.position.y=.1+shellH+p.heightM*.06;group.add(roof);
 addCylinder(group,e.id,Math.max(.04,r*.035),shellH*.82,r*1.04,shellH*.48,0,frame,10);
}
function buildPump(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 addBox(group,e.id,e.w*.9,.12,e.h*.76,0,.06,0,frame);
 const motor=addCylinder(group,e.id,Math.max(.12,e.h*.22),Math.max(.35,e.w*.46),-e.w*.18,p.heightM*.5,0,material(darkSteel,.42,.5),22,Math.PI/2);motor.rotation.x=Math.PI/2;
 const volute=tag(new THREE.Mesh(new THREE.TorusGeometry(Math.max(.12,e.h*.22),Math.max(.04,e.h*.07),12,28),body),e.id) as THREE.Mesh;volute.position.set(e.w*.25,p.heightM*.48,0);volute.rotation.y=Math.PI/2;group.add(volute);
 addCylinder(group,e.id,Math.max(.04,e.h*.07),Math.max(.2,e.w*.25),e.w*.39,p.heightM*.48,0,frame,14,Math.PI/2);
}
function buildGenerator(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 addBox(group,e.id,e.w*.92,.14,e.h*.84,0,.07,0,frame);const enclosure=addBox(group,e.id,e.w*.82,p.heightM*.76,e.h*.72,0,.14+p.heightM*.38,0,body);addEdgeOutline(group,enclosure);
 addBox(group,e.id,.04,p.heightM*.5,e.h*.5,e.w*.36,.14+p.heightM*.4,0,material(lightSteel,.75,.12));
 addCylinder(group,e.id,Math.max(.035,e.h*.035),p.heightM*.38,e.w*.28,p.heightM*.9,e.h*.18,frame,12);
}
function buildSolar(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const rows=Math.max(1,Math.min(8,Math.round(p.dimensions.panel_rows||Math.max(1,e.h/2)))),rowDepth=e.h/rows,tilt=THREE.MathUtils.degToRad(p.dimensions.tilt_deg||18);
 for(let i=0;i<rows;i++){
  const z=-e.h/2+rowDepth*(i+.5),panel=addBox(group,e.id,e.w*.92,.06,rowDepth*.72,0,.55,z,body,0,-tilt);addEdgeOutline(group,panel);
  for(const x of [-e.w*.38,e.w*.38])addBox(group,e.id,.05,.52,.05,x,.26,z,frame);
 }
}
function buildContainer(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 addBox(group,e.id,e.w*.94,.12,e.h*.92,0,.06,0,frame);const shell=addBox(group,e.id,e.w*.9,p.heightM*.82,e.h*.86,0,.12+p.heightM*.41,0,body);addEdgeOutline(group,shell);
 for(let i=-3;i<=3;i++)addBox(group,e.id,.025,p.heightM*.68,e.h*.88,i*e.w*.11,.12+p.heightM*.41,0,frame);
}
function buildPlatform(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 const legH=p.heightM*.62;addLegs(group,e.id,e.w*.82,e.h*.78,legH,frame);addBox(group,e.id,e.w*.9,.12,e.h*.86,0,legH+.06,0,body);
}
function buildConveyorDrive(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 addBox(group,e.id,e.w*.9,.12,e.h*.8,0,.06,0,frame);addCylinder(group,e.id,Math.max(.1,e.h*.2),e.h*.62,0,p.heightM*.45,0,body,22,Math.PI/2);addBox(group,e.id,e.w*.34,p.heightM*.32,e.h*.28,e.w*.28,p.heightM*.34,0,frame);
}
function buildGeneric(group:THREE.Group,e:Equipment,p:EquipmentRenderProfile,body:THREE.Material,frame:THREE.Material){
 addBox(group,e.id,e.w*.94,.12,e.h*.94,0,.06,0,frame);const primary=addBox(group,e.id,e.w*.84,p.heightM*.76,e.h*.8,0,.12+p.heightM*.38,0,body);addEdgeOutline(group,primary);
}

export function buildEquipmentAssembly(model:PlantModel,equipment:Equipment){
 const profile=equipmentRenderProfile(equipment),group=new THREE.Group();group.name=equipment.name;group.userData.equipmentId=equipment.id;group.userData.renderProfile=profile;
 const body=material(groupMaterial(equipment),.62,.16),frame=material(darkSteel,.56,.4);
 switch(profile.archetype){
  case 'stockpile':buildStockpile(group,equipment,profile,body,frame);break;
  case 'hopper':buildHopper(group,equipment,profile,body,frame);break;
  case 'hammer_crusher':buildCrusher(group,equipment,profile,body,frame);break;
  case 'vibrating_screen':buildScreen(group,equipment,profile,body,frame);break;
  case 'jig':buildJig(group,equipment,profile,body,frame);break;
  case 'knudsen_bowl':buildBowl(group,equipment,profile,body,frame);break;
  case 'cyclone':buildCyclone(group,equipment,profile,body,frame);break;
  case 'tank':buildTank(group,equipment,profile,body,frame);break;
  case 'pump':buildPump(group,equipment,profile,body,frame);break;
  case 'generator':buildGenerator(group,equipment,profile,body,frame);break;
  case 'solar_array':buildSolar(group,equipment,profile,body,frame);break;
  case 'container':buildContainer(group,equipment,profile,body,frame);break;
  case 'platform':buildPlatform(group,equipment,profile,body,frame);break;
  case 'conveyor_drive':buildConveyorDrive(group,equipment,profile,body,frame);break;
  default:buildGeneric(group,equipment,profile,body,frame);
 }
 const centreX=equipment.x+equipment.w/2,centreY=equipment.y+equipment.h/2;
 group.position.set(centreX-model.width/2,0,model.height/2-centreY);group.rotation.y=-THREE.MathUtils.degToRad(profile.rotationDeg);
 group.traverse(child=>{if((child as THREE.Mesh).isMesh){(child as THREE.Mesh).castShadow=true;(child as THREE.Mesh).receiveShadow=true;child.userData.equipmentId=equipment.id;}});
 return group;
}

export function routeEndpointElevation(equipment:Equipment|undefined,routeType:string){
 if(!equipment)return 1.5;const profile=equipmentRenderProfile(equipment);
 if(routeType==='water')return Math.max(.45,Math.min(1.4,profile.heightM*.35));
 if(routeType==='conveyor')return Math.max(.7,Math.min(3.2,profile.heightM*.62));
 return Math.max(.6,Math.min(2.8,profile.heightM*.5));
}

'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {Equipment,PlantModel} from '@/lib/plant/model';
import {groupNames,palette} from '@/lib/plant/model';
import {equipmentRenderProfile} from '@/lib/plant/equipment-model';
import {buildEquipmentAssembly,routeEndpointElevation} from './equipment-geometry';

const DEFAULT_ROUTE_HEIGHT=1.5;
const groupOrder=['feed','wet','recirc','con','tail','service'];

export function conceptHeightForEquipment(e:Equipment){return equipmentRenderProfile(e).heightM;}
function sitePoint(model:PlantModel,p:number[],elevation=0){return new THREE.Vector3(p[0]-model.width/2,elevation,model.height/2-p[1]);}
function materialColor(group:string){return new THREE.Color(palette[group]||'#66756f');}
function disposeObject(object:THREE.Object3D){
 const disposed=new Set<THREE.Material>();
 object.traverse(child=>{
  const mesh=child as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();
  const material=(mesh as any).material as THREE.Material|THREE.Material[]|undefined;
  for(const item of Array.isArray(material)?material:material?[material]:[])if(!disposed.has(item)){disposed.add(item);item.dispose();}
 });
}
function orientCylinder(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){
 const direction=b.clone().sub(a),length=direction.length();mesh.scale.set(1,length,1);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
}

export default function PlantCadSurface({model}:{model:PlantModel}){
 const host=useRef<HTMLDivElement>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null),controlsRef=useRef<OrbitControls|null>(null);
 const equipmentObjects=useRef(new Map<string,THREE.Object3D>()),routeGroup=useRef<THREE.Group|null>(null),gridHelper=useRef<THREE.GridHelper|null>(null);
 const [selectedId,setSelectedId]=useState(''),[routesVisible,setRoutesVisible]=useState(true),[gridVisible,setGridVisible]=useState(true),[projection,setProjection]=useState<'perspective'|'top'>('perspective');
 const selected=useMemo(()=>model.equipment.find(e=>e.id===selectedId)||null,[model,selectedId]);
 const selectedProfile=useMemo(()=>selected?equipmentRenderProfile(selected):null,[selected]);
 const connections=useMemo(()=>selected?model.streams.filter(s=>s.source===selected.id||s.target===selected.id):[],[model,selected]);
 const orderedEquipment=useMemo(()=>[...model.equipment].sort((a,b)=>{const ag=groupOrder.indexOf(a.group),bg=groupOrder.indexOf(b.group);return (ag<0?999:ag)-(bg<0?999:bg)||a.name.localeCompare(b.name);}),[model]);
 const fidelity=useMemo(()=>model.equipment.reduce((acc,e)=>{const state=equipmentRenderProfile(e).modelStatus;acc[state]=(acc[state]||0)+1;return acc;},{} as Record<string,number>),[model]);
 const resetView=useCallback((mode:'perspective'|'top')=>{
  const camera=cameraRef.current,controls=controlsRef.current;if(!camera||!controls)return;const extent=Math.max(model.width,model.height);controls.target.set(0,0,0);
  if(mode==='top')camera.position.set(0,extent*1.28,.01);else camera.position.set(model.width*.66,extent*.58,model.height*.78);
  camera.up.set(0,1,0);camera.near=.1;camera.far=extent*8;camera.updateProjectionMatrix();controls.update();
 },[model]);
 const focusEquipment=useCallback((id:string)=>{
  setSelectedId(id);const object=equipmentObjects.current.get(id),camera=cameraRef.current,controls=controlsRef.current;if(!object||!camera||!controls)return;
  const box=new THREE.Box3().setFromObject(object),centre=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(5,size.length()*1.45);controls.target.copy(centre);camera.position.set(centre.x+radius,centre.y+radius*.68,centre.z+radius);camera.updateProjectionMatrix();controls.update();
 },[]);

 useEffect(()=>{
  const container=host.current;if(!container)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f4f6f4');scene.fog=new THREE.Fog('#f4f6f4',Math.max(model.width,model.height)*1.5,Math.max(model.width,model.height)*3.3);
  const camera=new THREE.PerspectiveCamera(42,1,.1,1500);cameraRef.current=camera;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controlsRef.current=controls;controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=4;controls.maxDistance=Math.max(model.width,model.height)*3;
  scene.add(new THREE.HemisphereLight(0xffffff,0x738078,1.8));const sun=new THREE.DirectionalLight(0xffffff,2.15);sun.position.set(model.width*.35,Math.max(model.width,model.height)*.85,model.height*.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(model.width+18,model.height+18),new THREE.MeshStandardMaterial({color:0xf8f9f7,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;ground.receiveShadow=true;scene.add(ground);
  const boundaryGeometry=new THREE.BufferGeometry().setFromPoints([[0,0],[model.width,0],[model.width,model.height],[0,model.height],[0,0]].map(p=>sitePoint(model,p,.035)));scene.add(new THREE.Line(boundaryGeometry,new THREE.LineBasicMaterial({color:0x89978f})));
  const grid=new THREE.GridHelper(Math.max(model.width,model.height)*1.15,40,0xb9c2bd,0xdfe4e1);grid.position.y=.01;gridHelper.current=grid;scene.add(grid);
  const equipmentRoot=new THREE.Group();equipmentRoot.name='Equipment';scene.add(equipmentRoot);equipmentObjects.current.clear();
  for(const e of model.equipment){const object=buildEquipmentAssembly(model,e);equipmentRoot.add(object);equipmentObjects.current.set(e.id,object);}
  const routes=new THREE.Group();routes.name='Process routes';routeGroup.current=routes;scene.add(routes);
  const byId=new Map(model.equipment.map(e=>[e.id,e]));
  for(const stream of model.streams){
   const sourceElevation=routeEndpointElevation(byId.get(stream.source),stream.route_type),targetElevation=routeEndpointElevation(byId.get(stream.target),stream.route_type),middleElevation=Math.max(DEFAULT_ROUTE_HEIGHT,(sourceElevation+targetElevation)/2);
   const points=stream.points.map((p,index)=>sitePoint(model,p,index===0?sourceElevation:index===stream.points.length-1?targetElevation:middleElevation));
   const routeMaterial=new THREE.MeshStandardMaterial({color:materialColor(stream.kind),roughness:.55,metalness:.16});
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=a.distanceTo(b);if(length<.02)continue;const radius=stream.route_type==='conveyor'?.16:stream.route_type==='water'?.065:.09,segment=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,10),routeMaterial);orientCylinder(segment,a,b);segment.castShadow=true;segment.userData.streamId=stream.id;routes.add(segment);}
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down={x:0,y:0};
  const onDown=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY};};
  const onUp=(event:PointerEvent)=>{if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;const bounds=renderer.domElement.getBoundingClientRect();pointer.set(((event.clientX-bounds.left)/bounds.width)*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(equipmentRoot.children,true).find(item=>item.object.userData.equipmentId);if(hit)setSelectedId(String(hit.object.userData.equipmentId));};
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
  const resize=()=>{const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(container);resize();resetView('perspective');
  let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);controls.dispose();disposeObject(scene);renderer.dispose();renderer.domElement.remove();cameraRef.current=null;controlsRef.current=null;routeGroup.current=null;gridHelper.current=null;equipmentObjects.current.clear();};
 },[model,resetView]);

 useEffect(()=>{if(routeGroup.current)routeGroup.current.visible=routesVisible;},[routesVisible]);
 useEffect(()=>{if(gridHelper.current)gridHelper.current.visible=gridVisible;},[gridVisible]);
 useEffect(()=>{equipmentObjects.current.forEach((object,id)=>object.traverse(child=>{const mesh=child as THREE.Mesh;if(!mesh.isMesh)return;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const item of materials){const material=item as THREE.MeshStandardMaterial;if(!material?.emissive)continue;material.emissive.set(id===selectedId?0x244c3a:0x000000);material.emissiveIntensity=id===selectedId?.34:0;}}));},[selectedId]);
 const setView=(next:'perspective'|'top')=>{setProjection(next);resetView(next);};
 const dimensions=selectedProfile?Object.entries(selectedProfile.dimensions).slice(0,8):[];

 return <div className="cad-workspace">
  <div className="cad-toolbar"><div className="cad-title"><span className="ops-eyebrow">{model.revision} · semantic + parametric geometry</span><strong>Processing plant engineering model</strong><small>{model.width} × {model.height} m yard · {model.equipment.length} equipment assemblies · {model.streams.length} connected routes · {fidelity.specified||0} specified · {fidelity.vendor_reference||0} vendor-referenced · {fidelity.as_built||0} as-built</small></div><div className="cad-toolbar-actions" aria-label="3D plant view controls"><button aria-pressed={projection==='perspective'} onClick={()=>setView('perspective')}>Perspective</button><button aria-pressed={projection==='top'} onClick={()=>setView('top')}>Top</button><button onClick={()=>resetView(projection)}>Fit</button><label><input type="checkbox" checked={routesVisible} onChange={e=>setRoutesVisible(e.target.checked)}/> Routes</label><label><input type="checkbox" checked={gridVisible} onChange={e=>setGridVisible(e.target.checked)}/> Grid</label></div></div>
  <div className="cad-stage-shell"><div className="cad-stage" ref={host} role="img" aria-label="Interactive three-dimensional parametric MineralX processing plant model" tabIndex={0}/><aside className="cad-inspector">
   <label className="cad-equipment-jump">Equipment<select value={selectedId} onChange={e=>e.target.value?focusEquipment(e.target.value):setSelectedId('')}><option value="">Select equipment</option>{orderedEquipment.map(e=><option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}</select></label>
   {selected&&selectedProfile?<><div className="cad-inspector-head"><span className="ops-eyebrow">{selected.id} · {groupNames[selected.group]||selected.group}</span><h2>{selected.name}</h2></div><dl><div><dt>Model</dt><dd>{selectedProfile.archetype.replaceAll('_',' ')} · {selectedProfile.modelStatus.replaceAll('_',' ')}</dd></div><div><dt>Planning envelope</dt><dd>{selected.w} × {selected.h} m</dd></div><div><dt>Overall height</dt><dd>{selectedProfile.heightM.toFixed(2)} m</dd></div><div><dt>Orientation</dt><dd>{selectedProfile.rotationDeg.toFixed(1)}°</dd></div><div><dt>Basis</dt><dd>{selected.basis}</dd></div><div><dt>Process links</dt><dd>{connections.length} connected routes</dd></div></dl><p>{selected.note||'No engineering note recorded.'}</p><p className="ops-muted">{selectedProfile.rationale}</p>{dimensions.length>0&&<details open><summary>Parametric dimensions</summary><dl>{dimensions.map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{Number(value).toLocaleString('en-AU',{maximumFractionDigits:3})}</dd></div>)}</dl></details>}{selected.engineering?.specification?.length?<details><summary>Engineering specification</summary>{selected.engineering.specification.map((item,index)=><p key={`${item.key}:${index}`}><strong>{item.key}</strong><br/><small>{item.value}{item.unit?` ${item.unit}`:''}{item.basis?` · ${item.basis}`:''}</small></p>)}</details>:null}<button onClick={()=>focusEquipment(selected.id)}>Focus equipment</button>{!!connections.length&&<details><summary>Connected process routes</summary>{connections.map(route=><p key={route.id}><strong>{route.id}</strong><br/><small>{route.source} → {route.target} · {route.route_type}</small></p>)}</details>}</>:<div className="cad-inspector-empty"><span className="ops-eyebrow">Model navigation</span><h2>Select equipment</h2><p>Orbit, zoom and inspect the plant as connected equipment assemblies rather than generic blocks. ChatGPT design operations can move, resize, reroute and parametrically configure equipment while preserving stable IDs and the engineering change-control boundary.</p></div>}
   <div className="cad-model-basis"><strong>Model authority</strong><p>P5 horizontal position and envelopes remain the current controlled basis. Detailed 3D assemblies are generated deterministically from stored engineering parameters where available and otherwise from conservative equipment archetypes. Inferred geometry is visibly labelled and cannot be represented as vendor-certified or as-built without source evidence.</p></div>
  </aside></div>
 </div>;
}

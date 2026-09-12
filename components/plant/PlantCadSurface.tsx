'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {Equipment,PlantModel} from '@/lib/plant/model';
import {groupNames,palette} from '@/lib/plant/model';

const DEFAULT_ROUTE_HEIGHT=1.5;
const groupOrder=['feed','wet','recirc','con','tail','service'];

export function conceptHeightForEquipment(e:Equipment){
 const name=e.name.toLowerCase();
 const footprint=Math.max(e.w,e.h);
 if(name.includes('stockpile'))return Math.max(3.5,Math.min(7,footprint*.32));
 if(name.includes('tank')||name.includes('silo'))return Math.max(3.5,Math.min(9,footprint*.9));
 if(name.includes('cyclone'))return Math.max(3,Math.min(6,footprint*1.1));
 if(name.includes('hopper')||name.includes('bin'))return Math.max(2.8,Math.min(6,footprint*.85));
 if(name.includes('knudsen')||name.includes('bowl'))return Math.max(1.8,Math.min(3.6,footprint*.75));
 if(name.includes('screen'))return Math.max(1.6,Math.min(3,footprint*.45));
 if(name.includes('crusher'))return Math.max(2.6,Math.min(5,footprint*.7));
 if(name.includes('jig'))return Math.max(2,Math.min(3.5,footprint*.55));
 if(name.includes('pump'))return Math.max(1.2,Math.min(2.2,footprint*.45));
 if(name.includes('solar'))return .35;
 return Math.max(1.4,Math.min(4.5,footprint*.55));
}

function sitePoint(model:PlantModel,p:number[],elevation=0){
 return new THREE.Vector3(p[0]-model.width/2,elevation,model.height/2-p[1]);
}
function materialColor(group:string){return new THREE.Color(palette[group]||'#66756f');}
function disposeObject(object:THREE.Object3D){
 object.traverse(child=>{
  const mesh=child as THREE.Mesh;
  if(mesh.geometry)mesh.geometry.dispose();
  const material=(mesh as any).material as THREE.Material|THREE.Material[]|undefined;
  if(Array.isArray(material))material.forEach(item=>item.dispose());else material?.dispose();
 });
}
function orientCylinder(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){
 const direction=b.clone().sub(a),length=direction.length();
 mesh.scale.set(1,length,1);
 mesh.position.copy(a).add(b).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
}
function buildEquipmentObject(model:PlantModel,e:Equipment){
 const group=new THREE.Group();
 group.name=e.name;group.userData.equipmentId=e.id;
 const h=conceptHeightForEquipment(e),color=materialColor(e.group);
 const standard=new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.08});
 const dark=new THREE.MeshStandardMaterial({color:color.clone().multiplyScalar(.78),roughness:.8,metalness:.05});
 const name=e.name.toLowerCase();
 let primary:THREE.Mesh;
 if(name.includes('tank')||name.includes('silo')||name.includes('knudsen')||name.includes('bowl')||name.includes('cyclone')){
  const radius=Math.max(.35,Math.min(e.w,e.h)*.38);
  primary=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,h,24),standard);
  if(name.includes('cyclone')){
   const cone=new THREE.Mesh(new THREE.ConeGeometry(radius*.72,Math.max(1,h*.36),24),dark);
   cone.position.y=-h*.68;group.add(cone);
  }
 }else if(name.includes('stockpile')){
  primary=new THREE.Mesh(new THREE.ConeGeometry(Math.max(1,Math.min(e.w,e.h)*.47),h,28),standard);
 }else if(name.includes('hopper')||name.includes('bin')){
  primary=new THREE.Mesh(new THREE.ConeGeometry(Math.max(.5,Math.min(e.w,e.h)*.42),h,4),standard);
  primary.rotation.y=Math.PI/4;
 }else{
  primary=new THREE.Mesh(new THREE.BoxGeometry(e.w,h,e.h),standard);
  if(name.includes('screen'))primary.rotation.z=-.08;
 }
 const centre=sitePoint(model,[e.x+e.w/2,e.y+e.h/2],h/2);
 primary.position.copy(centre);primary.userData.equipmentId=e.id;group.add(primary);
 const base=new THREE.Mesh(new THREE.BoxGeometry(e.w+.18,.12,e.h+.18),dark);
 base.position.set(centre.x,.06,centre.z);base.userData.equipmentId=e.id;group.add(base);
 const edges=new THREE.LineSegments(new THREE.EdgesGeometry(primary.geometry,24),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.42}));
 edges.position.copy(primary.position);edges.rotation.copy(primary.rotation);edges.scale.copy(primary.scale);group.add(edges);
 return group;
}

export default function PlantCadSurface({model}:{model:PlantModel}){
 const host=useRef<HTMLDivElement>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null),controlsRef=useRef<OrbitControls|null>(null),sceneRef=useRef<THREE.Scene|null>(null);
 const equipmentObjects=useRef(new Map<string,THREE.Object3D>()),routeGroup=useRef<THREE.Group|null>(null),gridHelper=useRef<THREE.GridHelper|null>(null);
 const [selectedId,setSelectedId]=useState(''),[routesVisible,setRoutesVisible]=useState(true),[gridVisible,setGridVisible]=useState(true),[projection,setProjection]=useState<'perspective'|'top'>('perspective');
 const selected=useMemo(()=>model.equipment.find(e=>e.id===selectedId)||null,[model,selectedId]);
 const connections=useMemo(()=>selected?model.streams.filter(s=>s.source===selected.id||s.target===selected.id):[],[model,selected]);
 const orderedEquipment=useMemo(()=>[...model.equipment].sort((a,b)=>groupOrder.indexOf(a.group)-groupOrder.indexOf(b.group)||a.name.localeCompare(b.name)),[model]);

 const resetView=useCallback((mode:typeof projection=projection)=>{
  const camera=cameraRef.current,controls=controlsRef.current;if(!camera||!controls)return;
  const extent=Math.max(model.width,model.height);
  controls.target.set(0,0,0);
  if(mode==='top')camera.position.set(0,extent*1.28,.01);else camera.position.set(model.width*.66,extent*.58,model.height*.78);
  camera.up.set(0,1,0);camera.near=.1;camera.far=extent*8;camera.updateProjectionMatrix();controls.update();
 },[model,projection]);
 const focusEquipment=useCallback((id:string)=>{
  setSelectedId(id);
  const object=equipmentObjects.current.get(id),camera=cameraRef.current,controls=controlsRef.current;if(!object||!camera||!controls)return;
  const box=new THREE.Box3().setFromObject(object),centre=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(6,size.length()*1.5);
  controls.target.copy(centre);
  camera.position.set(centre.x+radius,centre.y+radius*.72,centre.z+radius);camera.updateProjectionMatrix();controls.update();
 },[]);

 useEffect(()=>{
  const container=host.current;if(!container)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f4f6f4');sceneRef.current=scene;
  const camera=new THREE.PerspectiveCamera(42,1,.1,1500);cameraRef.current=camera;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controlsRef.current=controls;controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=5;controls.maxDistance=Math.max(model.width,model.height)*3;
  scene.add(new THREE.HemisphereLight(0xffffff,0x7c8b84,1.75));
  const sun=new THREE.DirectionalLight(0xffffff,2.1);sun.position.set(model.width*.35,Math.max(model.width,model.height)*.85,model.height*.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(model.width+18,model.height+18),new THREE.MeshStandardMaterial({color:0xf8f9f7,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;ground.receiveShadow=true;scene.add(ground);
  const boundaryGeometry=new THREE.BufferGeometry().setFromPoints([[0,0],[model.width,0],[model.width,model.height],[0,model.height],[0,0]].map(p=>sitePoint(model,p,.035)));
  scene.add(new THREE.Line(boundaryGeometry,new THREE.LineBasicMaterial({color:0x89978f})));
  const grid=new THREE.GridHelper(Math.max(model.width,model.height)*1.15,32,0xb9c2bd,0xdfe4e1);grid.position.y=.01;gridHelper.current=grid;scene.add(grid);
  const equipmentRoot=new THREE.Group();equipmentRoot.name='Equipment';scene.add(equipmentRoot);equipmentObjects.current.clear();
  for(const e of model.equipment){const object=buildEquipmentObject(model,e);object.traverse(child=>{if((child as THREE.Mesh).isMesh){(child as THREE.Mesh).castShadow=true;(child as THREE.Mesh).receiveShadow=true;child.userData.equipmentId=e.id;}});equipmentRoot.add(object);equipmentObjects.current.set(e.id,object);}
  const routes=new THREE.Group();routes.name='Process routes';routeGroup.current=routes;scene.add(routes);
  for(const stream of model.streams){
   const points=stream.points.map(p=>sitePoint(model,p,DEFAULT_ROUTE_HEIGHT+(stream.kind==='service'?.35:stream.kind==='con'?.55:0)));
   const routeMaterial=new THREE.MeshStandardMaterial({color:materialColor(stream.kind),roughness:.58,metalness:.08});
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=a.distanceTo(b);if(length<.02)continue;
    const segment=new THREE.Mesh(new THREE.CylinderGeometry(stream.route_type==='conveyor'?.16:.09,stream.route_type==='conveyor'?.16:.09,1,8),routeMaterial.clone());orientCylinder(segment,a,b);segment.castShadow=true;routes.add(segment);
   }
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down={x:0,y:0};
  const onDown=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY};};
  const onUp=(event:PointerEvent)=>{
   if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
   const bounds=renderer.domElement.getBoundingClientRect();pointer.set(((event.clientX-bounds.left)/bounds.width)*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);raycaster.setFromCamera(pointer,camera);
   const hit=raycaster.intersectObjects(equipmentRoot.children,true).find(item=>item.object.userData.equipmentId);if(hit)setSelectedId(String(hit.object.userData.equipmentId));
  };
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
  const resize=()=>{const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  resetView('perspective');
  let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);controls.dispose();disposeObject(scene);renderer.dispose();renderer.domElement.remove();cameraRef.current=null;controlsRef.current=null;sceneRef.current=null;routeGroup.current=null;gridHelper.current=null;equipmentObjects.current.clear();};
 },[model,resetView]);

 useEffect(()=>{if(routeGroup.current)routeGroup.current.visible=routesVisible;},[routesVisible]);
 useEffect(()=>{if(gridHelper.current)gridHelper.current.visible=gridVisible;},[gridVisible]);
 useEffect(()=>{
  equipmentObjects.current.forEach((object,id)=>object.traverse(child=>{const mesh=child as THREE.Mesh;if(!mesh.isMesh)return;const material=mesh.material as THREE.MeshStandardMaterial;if(!material?.emissive)return;material.emissive.set(id===selectedId?0x244c3a:0x000000);material.emissiveIntensity=id===selectedId?.38:0;}));
 },[selectedId]);

 const setView=(next:'perspective'|'top')=>{setProjection(next);resetView(next);};
 return <div className="cad-workspace">
  <div className="cad-toolbar">
   <div className="cad-title"><span className="ops-eyebrow">P5 · concept geometry</span><strong>Processing plant model</strong><small>{model.width} × {model.height} m yard · {model.equipment.length} equipment envelopes · {model.streams.length} process routes</small></div>
   <div className="cad-toolbar-actions" aria-label="3D plant view controls">
    <button aria-pressed={projection==='perspective'} onClick={()=>setView('perspective')}>Perspective</button><button aria-pressed={projection==='top'} onClick={()=>setView('top')}>Top</button><button onClick={()=>resetView(projection)}>Fit</button>
    <label><input type="checkbox" checked={routesVisible} onChange={e=>setRoutesVisible(e.target.checked)}/> Routes</label><label><input type="checkbox" checked={gridVisible} onChange={e=>setGridVisible(e.target.checked)}/> Grid</label>
   </div>
  </div>
  <div className="cad-stage-shell">
   <div className="cad-stage" ref={host} aria-label="Interactive three-dimensional processing plant concept model"/>
   <aside className="cad-inspector">
    <label className="cad-equipment-jump">Equipment<select value={selectedId} onChange={e=>e.target.value?focusEquipment(e.target.value):setSelectedId('')}><option value="">Select equipment</option>{orderedEquipment.map(e=><option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}</select></label>
    {selected?<>
     <div className="cad-inspector-head"><span className="ops-eyebrow">{selected.id} · {groupNames[selected.group]||selected.group}</span><h2>{selected.name}</h2></div>
     <dl><div><dt>Footprint</dt><dd>{selected.w} × {selected.h} m</dd></div><div><dt>3D height</dt><dd>{conceptHeightForEquipment(selected).toFixed(1)} m <small>concept massing</small></dd></div><div><dt>Basis</dt><dd>{selected.basis}</dd></div><div><dt>Process links</dt><dd>{connections.length} connected routes</dd></div></dl>
     <p>{selected.note||'No engineering note recorded.'}</p><button onClick={()=>focusEquipment(selected.id)}>Focus equipment</button>
     {!!connections.length&&<details><summary>Connected process routes</summary>{connections.map(route=><p key={route.id}><strong>{route.id}</strong><br/><small>{route.source} → {route.target} · {route.route_type}</small></p>)}</details>}
    </>:<div className="cad-inspector-empty"><span className="ops-eyebrow">Model navigation</span><h2>Select equipment</h2><p>Orbit, zoom and inspect the P5 plant spatial model. Equipment colour follows process area; process routes remain source-linked to the P5 schedule.</p></div>}
    <div className="cad-model-basis"><strong>Geometry status</strong><p>Horizontal position and footprint come from the P5 engineering model. Vertical dimensions and equipment solids are deterministic concept massing for spatial review, not vendor-certified or as-built CAD.</p></div>
   </aside>
  </div>
 </div>;
}

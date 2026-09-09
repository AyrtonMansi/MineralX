'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {bounds,deform,type PitProject,type Vec3} from '@/lib/ops/pit/model';

type Props={project:PitProject;editing:boolean;radius:number;ghost:number;wire:boolean;selection:Vec3|null;view:'perspective'|'top';onSelect:(p:Vec3)=>void;onEdit:(p:number[],done:boolean)=>void};
export default function PitViewport(props:Props){
  const host=useRef<HTMLDivElement>(null),latest=useRef(props),runtime=useRef<{update:()=>void;fit:()=>void}|null>(null);
  const [error,setError]=useState('');latest.current=props;
  useEffect(()=>{
    const element=host.current;if(!element)return;
    setError('');let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setError('3D rendering is unavailable. Enable WebGL or use another browser. Your saved scans and exports remain available.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor('#142522');
    renderer.domElement.setAttribute('aria-label','Interactive pit terrain. Orbit by dragging; enable edit mode and select a surface to reshape it.');renderer.domElement.setAttribute('role','img');
    element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,0.01,10000),controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=false;controls.screenSpacePanning=true;
    const original=latest.current.project.original,box=bounds(original.positions),span=box.span;
    scene.add(new THREE.HemisphereLight(0xe9fff9,0x324842,2.2));
    const light=new THREE.DirectionalLight(0xffe7bc,3);light.position.set(span,span*2,span);scene.add(light);
    function geometry(positions:number[]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(original.indices);g.computeVertexNormals();return g;}
    const currentGeometry=geometry(latest.current.project.edited),originalGeometry=geometry(original.positions);
    const material=new THREE.MeshStandardMaterial({color:0xc1a173,roughness:0.92,metalness:0,side:THREE.DoubleSide});
    const ghostMaterial=new THREE.MeshBasicMaterial({color:0x69d5dd,transparent:true,opacity:0.22,depthWrite:false,side:THREE.DoubleSide,wireframe:true});
    const mesh=new THREE.Mesh(currentGeometry,material),ghostMesh=new THREE.Mesh(originalGeometry,ghostMaterial);ghostMesh.renderOrder=2;
    scene.add(mesh,ghostMesh);
    const grid=new THREE.GridHelper(span*1.8,20,0x49635b,0x2e443d);grid.position.set(box.center[0],box.min[1]-span*0.01,box.center[2]);scene.add(grid);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(span*0.008,12,8),new THREE.MeshBasicMaterial({color:0xffedb2,depthTest:false}));marker.visible=false;marker.renderOrder=10;scene.add(marker);
    const influence=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:0xffd68a,wireframe:true,transparent:true,opacity:0.13,depthWrite:false}));influence.visible=false;scene.add(influence);
    const handle=new THREE.Object3D();scene.add(handle);const transform=new TransformControls(camera,renderer.domElement);transform.setMode('translate');transform.setSpace('world');transform.setSize(0.85);scene.add(transform.getHelper());
    let disposed=false,gesture:number[]|null=null,gesturePoint:Vec3|null=null,wasDragging=false;
    const render=()=>{if(!disposed)renderer.render(scene,camera);};controls.addEventListener('change',render);
    function fit(){const top=latest.current.view==='top';camera.up.set(0,top?0:1,top?-1:0);camera.position.set(box.center[0]+(top?0:span),box.center[1]+span*(top?1.8:0.9),box.center[2]+(top?0:span));camera.near=Math.max(span/10000,0.0001);camera.far=span*100;camera.updateProjectionMatrix();controls.target.set(...box.center);controls.update();render();}
    function update(){
      const state=latest.current;
      const attribute=currentGeometry.getAttribute('position') as THREE.BufferAttribute;attribute.array.set(state.project.edited);attribute.needsUpdate=true;
      currentGeometry.computeVertexNormals();currentGeometry.computeBoundingSphere();
      ghostMaterial.opacity=state.ghost;ghostMesh.visible=state.ghost>0;material.wireframe=state.wire;
      marker.visible=!!state.selection;influence.visible=!!state.selection&&state.editing;
      if(state.selection){marker.position.set(...state.selection);influence.position.set(...state.selection);influence.scale.setScalar(state.radius);if(!gesture)handle.position.set(...state.selection);}
      if(state.selection&&state.editing){if(transform.object!==handle)transform.attach(handle);}else transform.detach();
      render();
    }
    transform.addEventListener('dragging-changed',event=>{
      controls.enabled=!event.value;
      if(event.value){gesture=latest.current.project.edited.slice();gesturePoint=handle.position.toArray() as Vec3;wasDragging=true;}
      else if(gesture&&gesturePoint){const delta=handle.position.clone().sub(new THREE.Vector3(...gesturePoint)).toArray() as Vec3;const result=deform(gesture,gesturePoint,latest.current.radius,delta);gesture=null;latest.current.onEdit(result,true);latest.current.onSelect(handle.position.toArray() as Vec3);}
    });
    transform.addEventListener('objectChange',()=>{if(gesture&&gesturePoint){const delta=handle.position.clone().sub(new THREE.Vector3(...gesturePoint)).toArray() as Vec3;latest.current.onEdit(deform(gesture,gesturePoint,latest.current.radius,delta),false);}render();});
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down:[number,number]=[0,0];
    const pointerDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];wasDragging=false;};
    const pointerUp=(e:PointerEvent)=>{
      if(!latest.current.editing||wasDragging||transform.dragging||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
      const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
      const hit=ray.intersectObject(mesh)[0];if(hit)latest.current.onSelect(hit.point.toArray() as Vec3);
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
    const lost=(event:Event)=>{event.preventDefault();setError('The graphics context was interrupted. Save or export your work, then reload to reopen the 3D view.');};renderer.domElement.addEventListener('webglcontextlost',lost);
    const resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();render();});resize.observe(element);
    runtime.current={update,fit};fit();update();
    return()=>{disposed=true;runtime.current=null;resize.disconnect();controls.dispose();transform.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('webglcontextlost',lost);currentGeometry.dispose();originalGeometry.dispose();material.dispose();ghostMaterial.dispose();marker.geometry.dispose();marker.material.dispose();influence.geometry.dispose();influence.material.dispose();grid.geometry.dispose();(Array.isArray(grid.material)?grid.material:[grid.material]).forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[props.project.id]);
  useEffect(()=>{runtime.current?.update();},[props.project.edited,props.editing,props.radius,props.ghost,props.wire,props.selection]);
  useEffect(()=>{runtime.current?.fit();},[props.view]);
  return <div className="pit-view"><div ref={host} className="pit-canvas"/>{error&&<div className="pit-view-error" role="alert">{error}</div>}<div className="pit-view-key"><span className="pit-swatch candidate"/>Planning surface <span className="pit-swatch original"/>Original scan</div><button className="pit-fit" onClick={()=>runtime.current?.fit()}>Fit surface</button></div>;
}

'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {boundaryData,spatialBounds} from '@/components/mineralx/spatial-import.js';
import {sharedLayerData,selectSharedMapRecord,interactiveSharedLayers} from '@/lib/ops/map-selection';
import {configureMapLibreWorker} from '@/lib/maplibre-worker';
import {Message} from './primitives';
import 'maplibre-gl/dist/maplibre-gl.css';
export default function SharedMap({project,userId,onOpen}:{project:any;userId:string;onOpen:(kind:string,id:string)=>void}){
 const target=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null),fittedProject=useRef(''),[ready,setReady]=useState(0),[error,setError]=useState(''),[visibility,setVisibility]=useState<Record<string,boolean>>({}),[opacity,setOpacity]=useState<Record<string,number>>({});const key=`mineralx-ops-map:${userId}:${project.id}`;
 const layers=useMemo(()=>[
 ...(project.spatialLayers||[]).filter((l:any)=>!l.archivedAt).map((l:any)=>({id:l.recordId,name:l.name,kind:'spatialLayers',data:l.data})),
 {id:'samples',name:'Physical samples',kind:'samples',data:{type:'FeatureCollection',features:(project.samples||[]).filter((s:any)=>!s.archivedAt&&Number.isFinite(s.lat)&&Number.isFinite(s.lng)).map((s:any)=>({type:'Feature',id:s.recordId,properties:{name:s.id,recordId:s.recordId,analyticalState:s.assayReviewStatus||'pending'},geometry:{type:'Point',coordinates:[s.lng,s.lat]}}))}},
 {id:'collars',name:'Drillholes',kind:'collars',data:{type:'FeatureCollection',features:(project.collars||[]).filter((s:any)=>!s.archivedAt&&Number.isFinite(s.lat)&&Number.isFinite(s.lng)).map((s:any)=>({type:'Feature',id:s.recordId,properties:{name:s.id,recordId:s.recordId},geometry:{type:'Point',coordinates:[s.lng,s.lat]}}))}},
 {id:'targets',name:'Targets',kind:'targets',data:{type:'FeatureCollection',features:(project.targets||[]).filter((s:any)=>!s.archivedAt&&Number.isFinite(s.lat)&&Number.isFinite(s.lng)).map((s:any)=>({type:'Feature',id:s.recordId,properties:{name:s.name||s.id,recordId:s.recordId},geometry:{type:'Point',coordinates:[s.lng,s.lat]}}))}},
 ...(project.boundary?[{id:'boundary',name:project.boundary.name||'Tenement boundaries',kind:'boundary',data:boundaryData(project.boundary)}]:[])], [project]);
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem(key)||'{}');setVisibility(s.visibility||{});setOpacity(s.opacity||{});}catch{setVisibility({});setOpacity({});setError('Map preferences could not be read. Shared geometry remains unchanged.');}},[key]);
 useEffect(()=>{let closed=false;import('maplibre-gl').then(mgl=>{if(closed||!target.current)return;configureMapLibreWorker(mgl);const map=new mgl.Map({container:target.current,style:{version:8,sources:{base:{type:'raster',tiles:['/api/basemap/satellite/{z}/{x}/{y}'],tileSize:256,attribution:'Esri World Imagery'}},layers:[{id:'base',type:'raster',source:'base'}]},center:[144,-20],zoom:5,attributionControl:{}});mapRef.current=map;map.addControl(new mgl.NavigationControl(),'top-right');
 // The dedicated Geology Globe owns globe rendering. This operational map stays
 // Mercator so nearby field coordinates, fit bounds, and rendered-feature hits stay
 // precise and consistent across MapLibre v6-capable devices.
 map.on('load',()=>{if(!closed)setReady(n=>n+1);});map.on('error',()=>{if(!closed)setError('A reference tile or map layer did not load. Saved project records are unaffected; offline basemap coverage is not included.');});}).catch(()=>{if(!closed)setError('This device could not open the map. Use the coordinate registers.');});return()=>{closed=true;mapRef.current?.remove();mapRef.current=null;};},[]);
 // The load event establishes style readiness. isStyleLoaded() can become false again
 // while projection/source work is pending; returning then would permanently skip layers
 // and detach selection handlers, because tile completion is not a React dependency.
 useEffect(()=>{const map=mapRef.current;if(!ready||!map)return;const existing=map.getStyle().layers.filter((l:any)=>l.id.startsWith('ops:'));for(const l of existing)map.removeLayer(l.id);for(const id of Object.keys(map.getStyle().sources))if(id.startsWith('ops:'))map.removeSource(id);
 const cleanups:(()=>void)[]=[];
 try{for(const l of layers){const id='ops:'+l.id;map.addSource(id,{type:'geojson',data:sharedLayerData(l,project.color||'#24553d'),...(['samples','collars','targets'].includes(l.kind)?{promoteId:'recordId'}:{})});const alpha=opacity[l.id]??1;
 for(const kind of ['fill','line','circle']){const lid=id+':'+kind;map.addLayer({id:lid,source:id,type:kind,filter:kind==='fill'?['==',['geometry-type'],'Polygon']:kind==='circle'?['==',['geometry-type'],'Point']:['!=',['geometry-type'],'Point'],layout:{visibility:visibility[l.id]===false?'none':'visible'},paint:kind==='fill'?{'fill-color':['get','fill'],'fill-opacity':['*',['get','fillOpacity'],alpha]}:kind==='line'?{'line-color':['get','stroke'],'line-width':['get','width'],'line-opacity':alpha}:{'circle-color':['get','point'],'circle-radius':6,'circle-opacity':alpha,'circle-stroke-width':1,'circle-stroke-color':'#ffffff','circle-stroke-opacity':alpha}});
 }
 }
 // Resolve the whole click once, retaining stable field identities above overlapping reference fills.
 const interactive=interactiveSharedLayers(layers,visibility,opacity);
 const selection=(e:any)=>selectSharedMapRecord(layers,interactive.length?map.queryRenderedFeatures(e.point,{layers:interactive}):[]);
 const click=(e:any)=>{const record=selection(e);if(record)onOpen(record.kind,record.id);};
 const move=(e:any)=>{map.getCanvas().style.cursor=selection(e)?'pointer':'';};
 const leave=()=>{map.getCanvas().style.cursor='';};
 map.on('click',click);map.on('mousemove',move);map.getCanvas().addEventListener('mouseleave',leave);
 cleanups.push(()=>{map.off('click',click);map.off('mousemove',move);map.getCanvas().removeEventListener('mouseleave',leave);leave();});
 }catch(e){setError((e as Error).message);}return()=>cleanups.forEach(f=>f());},[ready,layers,opacity,visibility,project.color,onOpen]);
 useEffect(()=>{const map=mapRef.current;if(!ready||!map||fittedProject.current===project.id)return;const data=project.boundary?boundaryData(project.boundary):{type:'FeatureCollection',features:layers.flatMap(l=>l.data.features)};const bounds=spatialBounds(data);if(bounds){map.fitBounds(bounds,{padding:50,maxZoom:15,duration:0});fittedProject.current=project.id;}},[ready,project.id,project.boundary,layers]);
 const preference=(v:Record<string,boolean>,o:Record<string,number>)=>{setVisibility(v);setOpacity(o);try{localStorage.setItem(key,JSON.stringify({visibility:v,opacity:o}));}catch{setError('Personal map preferences could not be saved. Shared source records have not changed.');}};
 return <>{error&&<Message error>{error}</Message>}<div className="ops-map-layout"><aside className="ops-map-menu" aria-label="Project map layers"><h3>Project map layers</h3><small>Personal visibility · shared published geometry</small>{layers.slice().reverse().map(l=><div key={l.id}><label><input type="checkbox" checked={visibility[l.id]!==false} onChange={e=>preference({...visibility,[l.id]:e.target.checked},opacity)}/>{l.name}</label><details><summary>Layer options</summary><label>Opacity<input aria-label={`${l.name} opacity`} type="range" min="0" max="1" step="0.05" value={opacity[l.id]??1} onChange={e=>preference(visibility,{...opacity,[l.id]:Number(e.target.value)})}/></label><button onClick={()=>{const b=spatialBounds(l.data);if(b)mapRef.current?.fitBounds(b,{padding:50,maxZoom:15});}}>Zoom to layer</button>{l.kind==='spatialLayers'&&<button onClick={()=>onOpen(l.kind,l.id)}>Source & revision</button>}</details></div>)}</aside><div className="ops-map-canvas" ref={target} aria-label="Shared project map"/></div></>;
}

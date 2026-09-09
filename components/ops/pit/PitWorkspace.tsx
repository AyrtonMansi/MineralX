'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {useOperations} from '../OperationsProvider';
import {Heading,Message} from '../primitives';
import {useEntryGuard} from '../navigation';
import {bounds,changeSummary,deform,exportOBJ,MAX_FILE_BYTES,practiceProject,surfaceArea,type PitProject,type Vec3} from '@/lib/ops/pit/model';
import {listProjects,projectJSON,restoreProject,saveProject} from '@/lib/ops/pit/storage';
const PitViewport=dynamic(()=>import('./PitViewport'),{ssr:false,loading:()=> <div className="pit-empty" role="status">Opening the 3D viewer…</div>});
const number=(n:number)=>new Intl.NumberFormat('en-AU',{maximumFractionDigits:2}).format(n);
function download(name:string,body:BlobPart,type='application/octet-stream'){
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function PitWorkspace(){
  const {context,scope,development}=useOperations();
  const namespace=`${development?'development':'staff'}:${context?.userId}:${scope?.id}`;
  const [project,setProject]=useState<PitProject|null>(null),current=useRef<PitProject|null>(null);
  const [saved,setSaved]=useState<PitProject[]>([]),[selectedSaved,setSelectedSaved]=useState('');
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const [units,setUnits]=useState<PitProject['source']['units']>('m'),[up,setUp]=useState<PitProject['source']['up']>('y'),[kind,setKind]=useState<PitProject['kind']>('pit');
  const [editing,setEditing]=useState(false),[radius,setRadius]=useState(3),[ghost,setGhost]=useState(.18),[wire,setWire]=useState(false),[view,setView]=useState<'perspective'|'top'>('perspective');
  const [selection,setSelection]=useState<Vec3|null>(null),[delta,setDelta]=useState<Vec3>([0,-1,0]);
  const [past,setPast]=useState<number[][]>([]),[future,setFuture]=useState<number[][]>([]),gestureStart=useRef<number[]|null>(null),worker=useRef<Worker|null>(null);
  useEntryGuard(dirty,busy);
  const update=(p:PitProject|null)=>{current.current=p;setProject(p);};
  useEffect(()=>{let active=true;listProjects(namespace).then(p=>{if(active)setSaved(p);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;worker.current?.terminate();};},[namespace]);
  const replace=(p:PitProject,isSaved=false)=>{update(p);setDirty(!isSaved);setPast([]);setFuture([]);gestureStart.current=null;setSelection(null);setRadius(Math.max(.1,bounds(p.original.positions).span*.12));setKind(p.kind);setEditing(false);setError('');setStatus(isSaved?'Opened the saved scenario.':'Scan ready. Save the scenario to keep it on this device.');};
  const mayReplace=()=>!dirty||window.confirm('Replace this unsaved scenario? Save or export it first to keep your edits.');
  const edit=(positions:number[],done:boolean)=>{
    const p=current.current;if(!p)return;
    if(!gestureStart.current)gestureStart.current=p.edited;
    if(done){const start=gestureStart.current;if(positions.some((n,i)=>Math.abs(n-start[i])>1e-8)){setPast(old=>[...old,start].slice(-12));setFuture([]);}gestureStart.current=null;}
    update({...p,edited:positions});setDirty(true);setStatus('Unsaved planning changes.');
  };
  const undo=()=>{const p=current.current;if(!p||!past.length)return;const previous=past[past.length-1];setFuture(f=>[p.edited,...f]);setPast(past.slice(0,-1));update({...p,edited:previous});setDirty(true);setSelection(null);};
  const redo=()=>{const p=current.current;if(!p||!future.length)return;setPast(old=>[...old,p.edited].slice(-12));update({...p,edited:future[0]});setFuture(future.slice(1));setDirty(true);setSelection(null);};
  async function importFile(file:File){
    if(!mayReplace())return;setError('');
    const backup=file.name.toLowerCase().endsWith('.json');
    if(file.size>(backup?80*1024*1024:MAX_FILE_BYTES)){setError(backup?'Scenario packages must be smaller than 80 MB.':'Export a smaller scan: the mesh file limit is 25 MB.');return;}
    if(!backup&&!/\.(obj|ply|stl)$/i.test(file.name)){setError('Choose an OBJ, PLY or STL mesh. A camera video does not contain an editable LiDAR mesh. See Scan with iPhone below.');return;}
    setBusy(true);setStatus('Reading and validating the scan…');
    try{
      let p:PitProject;
      if(backup)p=await restoreProject(await file.text());
      else{
        const bytes=await file.arrayBuffer();
        p=await new Promise<PitProject>((resolve,reject)=>{
          const w=new Worker(new URL('../../../lib/ops/pit/import.worker.ts',import.meta.url));worker.current=w;
          const timeout=setTimeout(()=>{w.terminate();reject(new Error('Scan processing took too long. Export a smaller mesh and retry.'));},30000);
          const stop=()=>{clearTimeout(timeout);w.terminate();worker.current=null;};
          w.onmessage=e=>{stop();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.project);};
          w.onerror=()=>{stop();reject(new Error('Unable to process this mesh. Export a smaller OBJ, PLY or STL and retry.'));};
          w.postMessage({bytes,name:file.name,units,up},[bytes]);
        });
        p.kind=kind;
      }
      replace(p);
    }catch(e){setError(e instanceof Error?e.message:'Unable to import the scan.');setStatus('Import failed. The open scenario was kept.');}
    finally{setBusy(false);}
  }
  async function save(){
    const p=current.current;if(!p)return;setBusy(true);setError('');
    try{const next=await saveProject(namespace,p);update(next);setDirty(false);setSaved(old=>[next,...old.filter(s=>s.id!==next.id)]);setSelectedSaved(next.id);setStatus('Saved on this device. Export a scenario backup to move it to another device.');}
    catch(e){setError(e instanceof Error?e.message:'Could not save. Your edits remain open.');setStatus('Not saved. Export a backup or retry.');}finally{setBusy(false);}
  }
  async function openSaved(){
    if(!mayReplace())return;setBusy(true);setError('');
    try{const latest=await listProjects(namespace);setSaved(latest);const p=latest.find(s=>s.id===selectedSaved);if(p)replace(p,true);else setError('This scenario is no longer available on this device.');}
    catch(e){setError(e instanceof Error?e.message:'Unable to reopen the saved scenario.');}finally{setBusy(false);}
  }
  const metrics=useMemo(()=>project?{...changeSummary(project.original.positions,project.edited),area:surfaceArea({positions:project.edited,indices:project.original.indices})}:null,[project]);
  const canEdit=!!selection&&delta.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000000)&&Number.isFinite(radius)&&radius>0;
  return <div className="pit-workspace">
    <Heading title="Pits & stockpiles" description="Bring a ground scan into 3D. Shape a planning scenario against the preserved original."/>
    <p className="pit-note">Device workspace · scans and scenarios stay in this browser, separate from shared operating records and the Operations development backup. Export a scenario backup before changing devices or clearing browser data.</p>
    {error&&<Message error>{error}<button onClick={()=>setError('')}>Dismiss</button></Message>}
    <details className="ops-card" open={!project}><summary>Import a scan or scenario</summary><section className="pit-import" aria-label="Import ground scan">
      <div><h2>Import a LiDAR scan</h2><p>Export a triangulated mesh from your iPhone scanning app, then select it here. The original file and ground geometry are preserved.</p><section className="pit-handoff" aria-label="iPhone LiDAR workflow"><p className="ops-eyebrow">IPHONE LIDAR WORKFLOW</p><ol><li><strong>Scan the ground</strong> in a native LiDAR scanner on an iPhone Pro or iPad Pro.</li><li><strong>Export a triangulated OBJ, PLY or STL</strong> to the Files app.</li><li><strong>Choose the exported mesh from Files</strong> below, then compare and reshape it here.</li></ol></section><details className="pit-capture"><summary>iPhone scan guidance and limitations</summary><ol>
        <li>Use a LiDAR-equipped iPhone Pro or iPad Pro and a native LiDAR scanner such as <a href="https://learn.poly.cam/hc/en-us/articles/36655587097620-How-to-Use-Space-Mode-LiDAR-Devices" target="_blank" rel="noreferrer">Polycam’s LiDAR Mesh mode</a>. Browser camera video alone cannot capture the LiDAR mesh.</li>
        <li>Scan the surface slowly with overlapping coverage. Keep a known distance in the scan to check scale. Capture the ground before excavation if you want a true before-and-after reference.</li>
        <li>Export an OBJ, PLY with faces, or STL mesh to Files. Export options depend on your scanning app and plan. Reduce large scans to under 25 MB, 180,000 vertices and 240,000 triangles.</li>
        <li>Select the export’s units and upward axis, then import it below. Check the dimensions before editing. You can re-import with corrected settings.</li>
        <li>Choose Edit surface, tap a wall or the ground, and drag the coloured X/Y/Z arrows. Change the influence radius to move a wider or narrower area. Export the scenario backup to continue on another device.</li>
      </ol><p className="pit-note">This is a planning model. Phone scans may have holes, drift and incomplete coverage; scale and georeferencing need independent verification. A scan made after digging does not reconstruct the former ground.</p></details></div>
      <fieldset disabled={busy} className="pit-import-settings"><legend>Source settings</legend>
        <label>Surface type<select value={kind} onChange={e=>setKind(e.target.value as PitProject['kind'])}><option value="pit">Pit</option><option value="stockpile">Stockpile</option></select></label>
        <label>Source units<select value={units} onChange={e=>setUnits(e.target.value as PitProject['source']['units'])}><option value="m">Metres</option><option value="cm">Centimetres</option><option value="mm">Millimetres</option></select></label>
        <label>Upward axis<select value={up} onChange={e=>setUp(e.target.value as PitProject['source']['up'])}><option value="y">Y up (ARKit / OBJ)</option><option value="z">Z up (survey export)</option></select></label>
        <label className="pit-file">Choose exported mesh from Files<input type="file" accept=".obj,.ply,.stl,.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(file);}}/><small>OBJ · PLY mesh · STL · MineralX scenario JSON</small></label>
      </fieldset>
    </section></details>
    {saved.length>0&&<div className="pit-saved"><label>Saved on this device<select value={selectedSaved} disabled={busy} onChange={e=>setSelectedSaved(e.target.value)}><option value="">Choose a scenario</option>{saved.map(p=><option key={p.id} value={p.id}>{p.name} · v{p.version}</option>)}</select></label><button disabled={busy||!selectedSaved} onClick={()=>void openSaved()}>Open saved scenario</button></div>}
    <p role="status" className="pit-status">{busy?'Working… '+status:status}</p>
    {!project?<section className="pit-empty"><div><h2>Your ground, in three dimensions.</h2><p>Import a real scan, or try the controls on a clearly marked practice surface.</p></div><button disabled={busy} onClick={()=>replace(practiceProject(kind))}>Try a practice {kind}</button></section>:<>
      <div className="pit-toolbar"><label className="pit-title-input">Scenario name<input maxLength={160} disabled={busy} value={project.name} onChange={e=>{update({...project,name:e.target.value});setDirty(true);}}/></label><span>{project.kind==='pit'?'Pit':'Stockpile'} · {project.original.positions.length/3} vertices</span><button disabled={busy||!dirty||!project.name.trim()} className="ops-primary pit-save" onClick={()=>void save()}>{busy?'Working…':'Save scenario'}</button></div>
      <div className="pit-toolbar" aria-label="3D controls"><button disabled={busy} aria-pressed={!editing} onClick={()=>setEditing(false)}>Explore</button><button disabled={busy} aria-pressed={editing} onClick={()=>setEditing(true)}>Edit surface</button><button disabled={busy} aria-pressed={view==='top'} onClick={()=>setView(view==='top'?'perspective':'top')}>Top view</button><button disabled={busy||!past.length} onClick={undo}>Undo</button><button disabled={busy||!future.length} onClick={redo}>Redo</button><button disabled={busy||!metrics?.moved} onClick={()=>{if(window.confirm('Reset planning edits to the preserved original scan? You can undo this reset.')){edit(project.original.positions.slice(),true);setSelection(null);}}}>Reset to original</button></div>
      <div className="pit-layout"><div><PitViewport project={project} editing={editing&&!busy} radius={radius} ghost={ghost} wire={wire} selection={selection} view={view} onSelect={setSelection} onEdit={edit}/><p className="pit-hint">{editing?'Tap the wall or ground to select it. Drag X (red), Y (green, vertical) or Z (blue). Two fingers pan; pinch to zoom.':'Drag to orbit · scroll or pinch to zoom · two fingers to pan. Switch to Edit surface to reshape the scan.'}</p>
        {metrics&&<div className="pit-metrics"><div><strong>{number(metrics.max)} m</strong><span>Maximum displacement</span></div><div><strong>{number(metrics.moved)}</strong><span>Moved vertices</span></div><div><strong>{number(metrics.area)} m²</strong><span>Modelled surface area</span></div></div>}
        <p className="pit-note">Dimensions use your selected source scale. Surface area is mesh area, not pit footprint. Dragging changes a planning scenario; it does not record measured excavation. Cut/fill volume and geotechnical approval are not inferred from an open phone scan.</p>
      </div><aside className="pit-panel" aria-label="Surface editing"><h2>{editing?'Shape the surface':'Compare with original'}</h2>
        <label>Original ground ghost · {Math.round(ghost*100)}%<input type="range" min="0" max="0.6" step="0.01" value={ghost} onChange={e=>setGhost(Number(e.target.value))}/></label>
        <label className="pit-check"><input type="checkbox" checked={wire} onChange={e=>setWire(e.target.checked)}/>Show planning wireframe</label><hr/>
        <label>Influence radius, m<input type="number" min="0.01" max="1000000" step="0.1" value={Number.isFinite(radius)?radius:''} disabled={busy} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>0)setRadius(Math.min(n,1000000));}}/></label>
        {selection?<><p className="pit-coordinates">Selected local point<br/>X {number(selection[0])} · Y {number(selection[1])} · Z {number(selection[2])} m</p><p>Move the selected area by metres. Y moves it up or down; X and Z move walls across the ground.</p></>:<p>{editing?'Select a point on the scan to place the drag arrows.':'Choose Edit surface, then tap the wall or area you want to move.'}</p>}
        <div className="pit-axes">{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>{axis}, m<input aria-label={`Move ${axis}, metres`} type="number" step="0.1" disabled={busy||!editing} value={Number.isFinite(delta[i])?delta[i]:''} onChange={e=>setDelta(old=>old.map((n,a)=>a===i?e.target.valueAsNumber:n) as Vec3)}/></label>)}</div>
        <button disabled={busy||!editing||!canEdit} onClick={()=>{if(selection){edit(deform(project.edited,selection,radius,delta),true);setSelection(selection.map((n,i)=>n+delta[i]) as Vec3);}}}>Apply movement</button>
        <hr/><h2>Keep & export</h2><button disabled={busy} onClick={()=>download('MineralX-scenario.json',projectJSON(project),'application/json')}>Export scenario backup</button><button disabled={busy} onClick={()=>download('MineralX-planning-surface.obj',exportOBJ({positions:project.edited,indices:project.original.indices}),'text/plain')}>Export edited OBJ</button><button disabled={busy} onClick={()=>download(project.source.name,project.source.bytes)}>Download original scan</button>
        <p>The scenario backup includes the original source and both surfaces. Open it here to continue on another device. Saves are local, unencrypted and visible to anyone using this browser profile.</p>
      </aside></div>
      <details className="pit-provenance"><summary>Scan provenance & dimensions</summary><p>Original: {project.source.name}<br/>Import: {project.source.units} · {project.source.up.toUpperCase()} up → local metres, Y up<br/>Source-space centre after axis conversion, m: {project.source.origin.map(number).join(', ')}<br/>Original extents, m: {bounds(project.original.positions).max.map((v,i)=>number(v-bounds(project.original.positions).min[i])).join(' × ')}<br/>SHA-256: <code>{project.source.sha256||'Synthetic practice surface — not a captured scan'}</code><br/>Saved revision: {project.version||'Not saved'}</p></details>
    </>}
  </div>;
}

'use client';
import {useEffect,useMemo,useState} from 'react';
import {FIELD_RELEASE,assertCollar,assertInterval,assertUniqueIds,collectSample,createDispatch,createFieldProject,createProgram,makeBackup,newRecordId,readBackup,reconcileReceipt,releaseAssays,stageAssays} from './field-workflows.js';
import {assayDisplay,clearUndo,downloadText,nextId,samplesToCsv,today,validateCoordinates} from './project-store.js';
import {loadLayerUiState,saveLayerUiState} from './layer-ui-store.js';
import './field-workflows.css';

const METHODS={rock_chip:'Rock chip',soil:'Soil',float:'Float',rc:'RC chips',diamond_core:'Diamond core',other:'Other'};
const NAV=['Map','Programs','Samples','Drilling','Review'];
function Label({children,wide=false}){return <label className={wide?'mxf-label mxf-wide':'mxf-label'}>{children}</label>;}
function Message({children,error=false}){return <p role={error?'alert':'status'} className={`mxf-message ${error?'mxf-error':''}`}>{children}</p>;}
function stateLabel(sample){return sample.lifecycle||((sample.assayHistory?.length||Object.keys(sample.assays||{}).length)?'legacy result':'collected');}

export default function FieldWorkflowPanel({persistence,onNavigate,onTool,onFocus,getMapCenter,legacyOpen}){
  const {store,setStore,hydrated,status,error,recovery,restore,loadLatest}=persistence;
  const project=store.projects.find(p=>p.id===store.activeProjectId)||store.projects[0];
  const [stage,setStage]=useState('Map'),[capture,setCapture]=useState(null),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
  const [filter,setFilter]=useState(''),[selected,setSelected]=useState([]),[laboratory,setLaboratory]=useState('');
  const [projectName,setProjectName]=useState(''),[programName,setProgramName]=useState(''),[programMethod,setProgramMethod]=useState('rock_chip');
  const [csv,setCsv]=useState(''),[certificate,setCertificate]=useState(''),[canonical,setCanonical]=useState(false),[reviewer,setReviewer]=useState('');
  const [backupPreview,setBackupPreview]=useState(null),[online,setOnline]=useState(true),[release,setRelease]=useState(null),[offlineReady,setOfflineReady]=useState(false);
  const locked=!hydrated||status==='blocked'||status==='conflict';
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  useEffect(()=>{
    if(!('serviceWorker' in navigator))return;
    let active=true;
    const message=event=>{if(active&&event.data?.type==='GEOLOGY_OFFLINE_READY')setOfflineReady(!!event.data.ready);};
    navigator.serviceWorker.addEventListener('message',message);
    navigator.serviceWorker.register('/mineralx/sw.js',{scope:'/mineralx'}).then(()=>navigator.serviceWorker.ready).then(registration=>{
      if(!active)return;
      const urls=performance.getEntriesByType('resource').map(r=>r.name).filter(url=>url.includes('/_next/static/'));
      registration.active?.postMessage({type:'CACHE_GEOLOGY_ASSETS',urls});
    }).catch(()=>{});
    return()=>{active=false;navigator.serviceWorker.removeEventListener('message',message);};
  },[]);
  useEffect(()=>{fetch('/api/mineralx-release',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(setRelease).catch(()=>{});},[]);
  useEffect(()=>{setCapture(null);setSelected([]);setFilter('');setCsv('');setCertificate('');setBackupPreview(null);},[project?.id]);
  const choose=(name)=>{setStage(name);setCapture(null);setFailure('');setMessage('');onNavigate();};
  const commit=(operation,success)=>{
    try{
      if(locked)throw new Error('Resolve the storage warning before changing records.');
      setStore(prev=>{
        const active=prev.projects.find(p=>p.id===project?.id);
        if(!active)throw new Error('Select a project first.');
        const next=operation(active);
        return {...prev,projects:prev.projects.map(p=>p.id===active.id?next:p)};
      });
      clearUndo();setFailure('');setMessage(success);return true;
    }catch(err){setFailure(err.message);return false;}
  };
  const allAssigned=useMemo(()=>new Set((project?.dispatches||[]).flatMap(d=>d.sampleRecordIds)),[project]);
  const samples=useMemo(()=>(project?.samples||[]).filter(s=>`${s.id} ${s.lith} ${s.notes} ${s.sampleType} ${stateLabel(s)}`.toLowerCase().includes(filter.toLowerCase())),[project,filter]);
  const backup=async()=>{
    try{
      const drafts={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('mx-field-draft-'))drafts[key]=localStorage.getItem(key);}
      downloadText(`MineralX-workspace-${today()}.json`,await makeBackup(store,{view:loadLayerUiState(),drafts}),'application/json');
      setMessage('Full workspace backup prepared, including stored photos, analytical history and drafts.');setFailure('');return true;
    }catch(err){setFailure(err.message);return false;}
  };
  const openCapture=(options={})=>{onNavigate();setCapture(options);setFailure('');setMessage('');};
  const tool=name=>{setCapture(null);setStage('Map');onTool(name);};
  const addProject=e=>{
    e.preventDefault();try{const p=createFieldProject(projectName);clearUndo();setStore(prev=>({...prev,activeProjectId:p.id,projects:[...prev.projects,p]}));setProjectName('');setFailure('');}catch(err){setFailure(err.message);}
  };
  return <>
    <div className="mxf-navigation">
      <nav aria-label="Geology workspace">{NAV.map(name=><button key={name} type="button" aria-current={stage===name?'page':undefined} onClick={()=>choose(name)}>{name}</button>)}</nav>
      <div className="mxf-status" data-state={status} role="status">{status==='saved'?'Saved on this device':status==='saving'?'Saving on this device…':status==='loading'?'Opening records…':status==='conflict'?'Save conflict':'Storage needs attention'}{!online?' · Offline':''}</div>
      <button type="button" className="mxf-primary mxf-collect" disabled={!project||locked} onClick={()=>openCapture()}>+ Collect sample</button>
    </div>
    <div className="mxf-release">Geology · {FIELD_RELEASE}{release?.commit&&release.commit!=='local'?` · ${release.commit.slice(0,7)}`:''} · Local workspace, not cloud-synced{offlineReady?' · Offline capture ready':''}</div>
    {(status==='blocked'||status==='conflict')&&<section className="mxf-recovery" aria-label="Workspace recovery"><strong>Your original records have not been overwritten.</strong><Message error>{error}</Message><div className="mxf-actions"><button type="button" onClick={backup}>Back up open workspace</button>{recovery?.raw&&<button type="button" onClick={()=>downloadText(`${recovery.key}-original.txt`,recovery.raw,'text/plain')}>Download original saved bytes</button>}<button type="button" onClick={()=>choose('Review')}>Open restore tools</button>{status==='conflict'&&<button type="button" onClick={async()=>{if(window.confirm('Back up your open changes first. Loading the latest saved workspace replaces the open view.'))try{await loadLatest();}catch(err){setFailure(err.message);}}}>Load latest saved revision</button>}</div></section>}
    {hydrated&&!project&&!locked&&<section className="mxf-welcome"><span className="mxf-kicker">FIELD GEOLOGY / YOUR WORKSPACE</span><h1>Start with a real project.</h1><p>Collect samples immediately, run a field program, or manage drilling. Your project records stay on this device until you export a backup.</p><form onSubmit={addProject}><Label>Project name<input required autoComplete="off" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project or tenement name" /></Label><button className="mxf-primary" type="submit">Create project</button></form><button type="button" onClick={()=>choose('Review')}>Restore an existing workspace</button></section>}
    {hydrated&&((project&&(capture||stage!=='Map'))||stage==='Review')&&<section className="mxf-panel" aria-label={capture?'Sample collection':`${stage} workspace`}>
      <header className="mxf-panel-head"><div><span className="mxf-kicker">{project?.name||'WORKSPACE RECOVERY'}</span><h1>{capture?(capture.observation?'Field observation':'Collect a sample'):stage}</h1></div><button type="button" aria-label="Close workspace panel" onClick={()=>{setCapture(null);setStage('Map');}}>×</button></header>
      <div className="mxf-panel-body">
        {failure&&<Message error>{failure}</Message>}{message&&<Message>{message}</Message>}
        {capture&&project?<SampleForm key={`${project.id}-${capture.collarRecordId||''}-${capture.programId||''}-${capture.observation||false}`} project={project} initial={capture} locked={locked} getMapCenter={getMapCenter} onCancel={()=>setCapture(null)} onSave={(draft,next)=>{
          const success=commit(p=>{
            if(capture.observation){const lat=Number(draft.lat),lng=Number(draft.lng);if(draft.lat===''||draft.lng===''||!validateCoordinates(lat,lng))throw new Error('Enter valid actual observation coordinates.');return {...p,observations:[...(p.observations||[]),{recordId:newRecordId(),id:draft.id||nextId(p.observations||[],'OBS-'),lat,lng,lith:draft.lith,notes:draft.notes,date:draft.date,coordSource:draft.coordSource,programId:draft.programId||null}]};}
            return collectSample(p,draft);
          },next?'Record added. Ready for the next collection.':'Record added to the project.');
          if(success&&!next){setCapture(null);setStage(capture.observation?'Map':'Samples');}return success;
        }}/>:<>
          {stage==='Programs'&&project&&<>
            <p className="mxf-muted">Programs group planned field work. Ad hoc samples do not need a program and keep their identity when assigned later.</p>
            <form className="mxf-form" onSubmit={e=>{e.preventDefault();if(commit(p=>createProgram(p,programName,programMethod),'Program created.'))setProgramName('');}}><Label wide>Program name<input required value={programName} onChange={e=>setProgramName(e.target.value)} placeholder="Reconnaissance or sampling campaign" /></Label><Label>Primary method<select value={programMethod} onChange={e=>setProgramMethod(e.target.value)}>{Object.entries(METHODS).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Label><button type="submit" className="mxf-primary" disabled={locked}>Create program</button></form>
            {(project.programs||[]).map(program=><article className="mxf-card" key={program.recordId}><div className="mxf-card-title"><strong>{program.name}</strong><span>{program.status}</span></div><p>{METHODS[program.method]||program.method} · {project.samples.filter(s=>s.programId===program.recordId).length} collected samples</p><button type="button" disabled={locked} onClick={()=>openCapture({programId:program.recordId,sampleType:program.method})}>Collect in this program</button></article>)}
            {project.targets?.length>0&&<button type="button" onClick={()=>tool('targets')}>Open target worklist ({project.targets.length})</button>}
          </>}
          {stage==='Samples'&&project&&<>
            <div className="mxf-actions"><input className="mxf-search" aria-label="Search sample register" placeholder="Search bag ID, method, status or geology" value={filter} onChange={e=>setFilter(e.target.value)} /><button type="button" onClick={()=>downloadText('sample-register.csv',samplesToCsv(samples))}>Export shown</button></div>
            <p className="mxf-muted">{samples.length} physical samples · {selected.length} selected for dispatch</p>
            {!samples.length&&<p className="mxf-empty">No samples in this view. Collect a sample or import field records from Review.</p>}
            {samples.map(s=><details className="mxf-sample" key={s.recordId||s.id}><summary><input type="checkbox" aria-label={`Select ${s.id} for dispatch`} disabled={locked||allAssigned.has(s.recordId)} checked={selected.includes(s.recordId)} onClick={e=>e.stopPropagation()} onChange={e=>setSelected(prev=>e.target.checked?[...prev,s.recordId]:prev.filter(id=>id!==s.recordId))} /><span><strong>{s.id}</strong><small>{METHODS[s.sampleType]||s.sampleType} · {s.holeId?`${s.holeId} / ${s.from}–${s.to} m`:s.date}</small></span><span className="mxf-tag">{stateLabel(s)}</span></summary><div className="mxf-detail"><p>{s.lith||'Lithology not recorded'}{s.notes?` · ${s.notes}`:''}</p><p>{s.holeId?'Collar reference, not a downhole position: ':''}{s.lat}, {s.lng} · {s.coordSource||'unknown coordinate source'}</p><p>{Object.keys({...s.assays,...s.detectionLimits}).map(el=>assayDisplay(s,el)).filter(Boolean).join(' · ')||'No released analytical results.'}</p><Label>Program<select disabled={locked} value={s.programId||''} onChange={e=>commit(p=>({...p,samples:p.samples.map(row=>row.recordId===s.recordId?{...row,programId:e.target.value||null}:row)}),'Program assignment updated; bag identity unchanged.')}><option value="">Ad hoc collection</option>{(project.programs||[]).map(p=><option key={p.recordId} value={p.recordId}>{p.name}</option>)}</select></Label>{s.assayHistory?.map((h,i)=><details key={`${h.batchRecordId||'legacy'}-${i}`}><summary>{h.certificate||'Legacy import'} · {h.reviewedAt||h.importedAt}</summary><pre>{JSON.stringify(h,null,2)}</pre></details>)}<button type="button" onClick={()=>{choose('Map');onFocus(s.lat,s.lng);}}>Locate on map</button></div></details>)}
            {selected.length>0&&<form className="mxf-dispatch" onSubmit={e=>{e.preventDefault();if(commit(p=>createDispatch(p,selected,laboratory),'Dispatch recorded. Reconcile the laboratory receipt in Review.')){setSelected([]);setLaboratory('');}}}><Label>Receiving laboratory<input required value={laboratory} onChange={e=>setLaboratory(e.target.value)} /></Label><button disabled={locked} type="submit" className="mxf-primary">Record dispatch ({selected.length})</button></form>}
          </>}
          {stage==='Drilling'&&project&&<>
            <p className="mxf-muted">Collars, physical sample intervals, downhole surveys and geological logs remain separate records.</p>
            <CollarForm project={project} locked={locked} onSave={draft=>commit(p=>{const c={...draft,recordId:newRecordId(),date:today()};assertCollar(c);assertUniqueIds(p.collars,[c],'Hole');return {...p,collars:[...p.collars,c]};},'Drillhole added.')} />
            {project.collars.map(c=><article key={c.recordId||c.id} className="mxf-card"><div className="mxf-card-title"><strong>{c.id}</strong><span>{c.depth!=null?`${c.depth} m`:'Depth not recorded'}</span></div><p>{c.lat}, {c.lng} · {c.azimuth??'—'}° azimuth · {c.dip??'—'}° dip</p><div className="mxf-actions"><button type="button" disabled={locked} onClick={()=>openCapture({sampleType:'rc',collarRecordId:c.recordId})}>Sample RC interval</button><button type="button" disabled={locked} onClick={()=>openCapture({sampleType:'diamond_core',collarRecordId:c.recordId})}>Sample core interval</button></div><small>{(project.intervals||[]).filter(i=>i.holeId===c.id).length} assay/sample intervals · {(project.surveys||[]).filter(i=>i.holeId===c.id).length} survey shots · {(project.geology||[]).filter(i=>i.holeId===c.id).length} geological log intervals</small></article>)}
            {!!project.collars.length&&<DownholeForm project={project} locked={locked} onSave={(kind,row)=>commit(p=>{const c=p.collars.find(c=>c.recordId===row.collarRecordId);if(!c)throw new Error('Select a hole from this project.');const record={...row,holeId:c.id,recordId:newRecordId()};if(kind==='geology'){assertInterval(record.from,record.to,p.geology||[],c.id);if(c.depth!=null&&record.to>c.depth)throw new Error('The log extends past the hole depth.');}else{if(![record.depth,record.azimuth,record.dip].every(Number.isFinite)||record.depth<0||record.azimuth<0||record.azimuth>=360||Math.abs(record.dip)>90||c.depth!=null&&record.depth>c.depth)throw new Error('Invalid survey depth, azimuth or dip.');if((p.surveys||[]).some(s=>s.holeId===c.id&&s.depth===record.depth))throw new Error('A survey already exists at that depth.');}return {...p,[kind]:[...(p[kind]||[]),record]};},'Downhole record added.')} />}
            <button type="button" onClick={()=>tool('holes')}>Inspect and export downhole tables</button>
          </>}
          {stage==='Review'&&<>
            <h2>Workspace recovery</h2><p className="mxf-muted">Backups include all project records, stored photos, original imported fields, dispatches, analytical history and field drafts. An old preview URL stores data separately from this domain.</p>
            <div className="mxf-actions"><button type="button" onClick={backup}>Download full backup</button><Label>Restore a backup<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{setBackupPreview(await readBackup(await file.text()));setFailure('');}catch(err){setFailure(err.message);}}}/></Label></div>
            {backupPreview&&<div className="mxf-card"><strong>Restore preview</strong><p>{backupPreview.store.projects.length} projects · {backupPreview.store.projects.reduce((n,p)=>n+p.samples.length,0)} samples · backup created {backupPreview.createdAt}</p><p>This replaces the open workspace. The previous saved database snapshot is retained.</p><button type="button" onClick={async()=>{try{if(!await backup())return;await restore(backupPreview.store);saveLayerUiState(backupPreview.layerUi.view||backupPreview.layerUi);for(const [key,value] of Object.entries(backupPreview.layerUi.drafts||{}))if(key.startsWith('mx-field-draft-')&&typeof value==='string')localStorage.setItem(key,value);setBackupPreview(null);setMessage('Workspace restored. Reload to apply restored map-layer settings.');}catch(err){setFailure(err.message);}}}>Back up current view and restore this backup</button><button type="button" onClick={()=>setBackupPreview(null)}>Cancel restore</button></div>}
            {project&&<>
              <h2>Field imports</h2><p className="mxf-muted">Import sample locations, collars, boundaries and sample photos. Review laboratory assays below before releasing grades.</p><button type="button" disabled={locked} onClick={()=>tool('upload')}>Import field records / KML / photos</button>
              <h2>Laboratory receipts</h2>{!(project.dispatches||[]).length&&<p className="mxf-empty">Select physical samples in Samples to record a dispatch.</p>}{(project.dispatches||[]).map(d=><ReceiptCard key={d.recordId} dispatch={d} project={project} locked={locked} onSave={(ids,reference)=>commit(p=>reconcileReceipt(p,d.recordId,ids,reference),'Laboratory receipt reconciled.')} />)}
              <h2>Import analytical results</h2><p className="mxf-muted">Stage → resolve exceptions → geologist review → release. Raw CSV and previous results remain in the workspace. Releasing a batch is not automated QA/QC acceptance.</p>
              <form className="mxf-form" onSubmit={e=>{e.preventDefault();if(commit(p=>{const batch=stageAssays(p,csv,certificate,canonical);return {...p,assayBatches:[...(p.assayBatches||[]),batch]};},'Batch staged for review. No grades were overwritten.')){setCsv('');setCertificate('');}}}>
                <Label wide>Certificate / batch reference<input required value={certificate} onChange={e=>setCertificate(e.target.value)}/></Label><Label wide>Laboratory CSV file<input type="file" accept=".csv,text/csv" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(f){setCsv(await f.text());if(!certificate)setCertificate(f.name);}}}/></Label><Label wide>CSV result text<textarea required rows={5} placeholder={'sample_id,Au_ppb,Cu_ppm\nBAG-0001,500,1000'} value={csv} onChange={e=>setCsv(e.target.value)}/></Label><label className="mxf-check mxf-wide"><input type="checkbox" checked={canonical} onChange={e=>setCanonical(e.target.checked)}/>I confirm unlabelled analyte columns use MineralX display units (Au/Ag g/t; Cu and other base metals %).</label><button type="submit" className="mxf-primary" disabled={locked}>Stage results for review</button>
              </form>
              <Label>Reviewing geologist<input value={reviewer} onChange={e=>setReviewer(e.target.value)} placeholder="Name for the local review record"/></Label>
              {[...(project.assayBatches||[])].reverse().map(b=><article className="mxf-card" key={b.recordId}><div className="mxf-card-title"><strong>{b.certificate}</strong><span>{b.status}</span></div><p>{b.results.length} analyte results · {b.issues.length} import exceptions</p>{b.issues.map((issue,i)=><Message error key={i}>{issue}</Message>)}<details><summary>Inspect reported and normalized results</summary><div className="mxf-table-scroll"><table><thead><tr><th>Bag</th><th>Reported</th><th>Normalized</th></tr></thead><tbody>{b.results.map(r=><tr key={r.recordId}><td>{r.sampleId}</td><td>{r.element} {r.reportedText} {r.sourceUnit||'unknown unit'}</td><td>{r.value??(r.detectionLimit!=null?`<${r.detectionLimit}`:'unresolved')} {r.canonicalUnit}</td></tr>)}</tbody></table></div></details><div className="mxf-actions"><button type="button" onClick={()=>downloadText(`${b.certificate.replace(/[^a-z0-9._-]/gi,'_')}.csv`,b.rawCsv)}>Export original CSV</button>{b.status==='pending'&&<button type="button" className="mxf-primary" disabled={locked||!!b.issues.length} onClick={()=>commit(p=>releaseAssays(p,b.recordId,reviewer),'Reviewed results released. Earlier results remain in analytical history.')}>Release reviewed results</button>}</div></article>)}
            </>}
          </>}
        </>}
      </div>
    </section>}
    {hydrated&&project&&stage==='Map'&&!capture&&!legacyOpen&&<aside className="mxf-map-context"><span className="mxf-kicker">{project.demo?'DEMONSTRATION RECORDS':'ACTIVE PROJECT'}</span><h1>{project.name}</h1><p>{project.samples.length} samples · {project.collars.length} holes · {(project.programs||[]).length} field programs</p>{!online&&<p className="mxf-muted">Field capture remains available. Basemaps and public layers require a connection.</p>}<div className="mxf-actions"><button type="button" onClick={()=>tool('layers')}>Map layers</button><button type="button" disabled={locked} onClick={()=>openCapture({observation:true})}>+ Observation</button></div>{(project.observations||[]).slice(-3).map(o=><button className="mxf-observation" key={o.recordId} type="button" onClick={()=>onFocus(o.lat,o.lng)}>{o.id} · {o.lith||o.notes||'Field observation'}</button>)}</aside>}
  </>;
}

function SampleForm({project,initial,locked,getMapCenter,onSave,onCancel}){
  const defaults=()=>({id:'',date:today(),sampleType:initial.sampleType||'rock_chip',programId:initial.programId||'',collarRecordId:initial.collarRecordId||'',lat:'',lng:'',from:'',to:'',lith:'',notes:'',coordSource:'unknown',qaqcType:'none',duplicateRecordId:''});
  const draftKey=`mx-field-draft-${project.id}-${initial.observation?'observation':initial.collarRecordId||'sample'}-${initial.programId||'adhoc'}`;
  const [draft,setDraft]=useState(()=>{try{return {...defaults(),...JSON.parse(localStorage.getItem(draftKey)||'{}')};}catch{return defaults();}});
  const [notice,setNotice]=useState(''),[gps,setGps]=useState(false);
  useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{setNotice('Draft could not be saved locally. Save the record or copy your notes before closing.');}},[draft,draftKey]);
  const set=(key,value)=>setDraft(prev=>({...prev,[key]:value}));
  const drilling=!initial.observation&&['rc','diamond_core'].includes(draft.sampleType);
  const locate=()=>{
    if(!navigator.geolocation){setNotice('GPS is unavailable. Enter coordinates manually.');return;}
    setGps(true);navigator.geolocation.getCurrentPosition(position=>{setDraft(prev=>({...prev,lat:String(position.coords.latitude),lng:String(position.coords.longitude),coordSource:'gps_handheld',coordinateAccuracyM:position.coords.accuracy}));setGps(false);setNotice(`GPS captured. Reported accuracy ±${Math.round(position.coords.accuracy)} m.`);},err=>{setGps(false);setNotice(`GPS could not be captured: ${err.message}`);},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
  return <form className="mxf-form" onSubmit={e=>{e.preventDefault();const next=e.nativeEvent.submitter?.value==='next';if(onSave(draft,next)){try{localStorage.removeItem(draftKey);}catch{}setDraft({...defaults(),sampleType:draft.sampleType,programId:draft.programId,collarRecordId:draft.collarRecordId});}}}>
    <p className="mxf-wide mxf-muted">{initial.observation?'Record an observation without creating a physical sample bag.':'One bag identity follows collection, dispatch, receipt and analytical review.'}</p>
    <Label>{initial.observation?'Observation ID':'Bag / sample ID'}<input value={draft.id} onChange={e=>set('id',e.target.value)} placeholder={nextId(initial.observation?project.observations||[]:project.samples,initial.observation?'OBS-':project.idPrefix)} autoComplete="off" /></Label><Label>Collection date<input required type="date" value={draft.date} onChange={e=>set('date',e.target.value)} /></Label>
    {!initial.observation&&<Label>Sampling method<select value={draft.sampleType} onChange={e=>set('sampleType',e.target.value)}>{Object.entries(METHODS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></Label>}
    <Label>Program (optional)<select value={draft.programId} onChange={e=>set('programId',e.target.value)}><option value="">Ad hoc collection</option>{(project.programs||[]).map(p=><option value={p.recordId} key={p.recordId}>{p.name}</option>)}</select></Label>
    {drilling?<><Label wide>Drillhole<select required value={draft.collarRecordId} onChange={e=>set('collarRecordId',e.target.value)}><option value="">Select a hole</option>{project.collars.map(c=><option key={c.recordId} value={c.recordId}>{c.id}</option>)}</select></Label><Label>From (m)<input required type="number" min="0" step="any" value={draft.from} onChange={e=>set('from',e.target.value)}/></Label><Label>To (m)<input required type="number" min="0" step="any" value={draft.to} onChange={e=>set('to',e.target.value)}/></Label></>:<>
      <div className="mxf-actions mxf-wide"><button type="button" disabled={gps||locked} onClick={locate}>{gps?'Capturing GPS…':'Capture GPS'}</button><button type="button" onClick={()=>{const c=getMapCenter();if(c){setDraft(prev=>({...prev,lat:String(c.lat),lng:String(c.lng),coordSource:'digitised',coordinateAccuracyM:null}));setNotice('Map centre selected. Confirm this is the actual collection location.');}else setNotice('The map is not ready. Use GPS or manual coordinates.');}}>Use map centre</button></div>
      <Label>Latitude (WGS84)<input required type="number" step="any" min="-90" max="90" value={draft.lat} onChange={e=>{set('lat',e.target.value);set('coordSource','unknown');}} /></Label><Label>Longitude (WGS84)<input required type="number" step="any" min="-180" max="180" value={draft.lng} onChange={e=>{set('lng',e.target.value);set('coordSource','unknown');}} /></Label>
    </>}
    <Label wide>Lithology / geological description<input value={draft.lith} onChange={e=>set('lith',e.target.value)}/></Label><Label wide>Field notes<textarea rows={3} value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Label>
    {!initial.observation&&<><Label>QA/QC type<select value={draft.qaqcType} onChange={e=>set('qaqcType',e.target.value)}><option value="none">Original sample</option><option value="duplicate">Field duplicate</option></select></Label>{draft.qaqcType==='duplicate'&&<Label>Original sample<select required value={draft.duplicateRecordId} onChange={e=>set('duplicateRecordId',e.target.value)}><option value="">Select original bag</option>{project.samples.map(s=><option key={s.recordId} value={s.recordId}>{s.id}</option>)}</select></Label>}</>}
    {notice&&<div className="mxf-wide"><Message>{notice}</Message></div>}<div className="mxf-actions mxf-wide"><button type="submit" value="save" className="mxf-primary" disabled={locked}>Save record</button><button type="submit" value="next" disabled={locked}>Save and next</button><button type="button" onClick={onCancel}>Close (keep draft)</button></div>
  </form>;
}
function CollarForm({project,locked,onSave}){
  return <details className="mxf-card"><summary>Add drillhole</summary><form className="mxf-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const draft={id:String(data.get('id')).trim(),lat:Number(data.get('lat')),lng:Number(data.get('lng')),azimuth:Number(data.get('azimuth')),dip:Number(data.get('dip')),depth:Number(data.get('depth'))};if(onSave(draft))e.currentTarget.reset();}}><Label>Hole ID<input name="id" required placeholder={`${project.idPrefix}DH-001`}/></Label><Label>Depth (m)<input name="depth" required type="number" step="any" min="0.01"/></Label><Label>Latitude (WGS84)<input name="lat" required type="number" step="any" min="-90" max="90"/></Label><Label>Longitude (WGS84)<input name="lng" required type="number" step="any" min="-180" max="180"/></Label><Label>Azimuth (degrees)<input name="azimuth" required type="number" min="0" max="359.999" step="any"/></Label><Label>Dip (degrees)<input name="dip" required type="number" min="-90" max="90" step="any"/></Label><button type="submit" className="mxf-primary" disabled={locked}>Add hole</button></form></details>;
}
function DownholeForm({project,locked,onSave}){
  const [kind,setKind]=useState('geology');
  return <details className="mxf-card"><summary>Add geological log or survey</summary><form className="mxf-form" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);const row={collarRecordId:String(d.get('hole')),...(kind==='geology'?{from:Number(d.get('from')),to:Number(d.get('to')),lithology:String(d.get('lithology')||''),notes:String(d.get('notes')||'')}:{depth:Number(d.get('depth')),azimuth:Number(d.get('azimuth')),dip:Number(d.get('dip'))})};if(onSave(kind,row))e.currentTarget.reset();}}><Label>Record type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="geology">Geological log</option><option value="surveys">Downhole survey</option></select></Label><Label>Hole<select name="hole" required>{project.collars.map(c=><option key={c.recordId} value={c.recordId}>{c.id}</option>)}</select></Label>{kind==='geology'?<><Label>From (m)<input name="from" required type="number" min="0" step="any"/></Label><Label>To (m)<input name="to" required type="number" min="0" step="any"/></Label><Label wide>Lithology<input name="lithology"/></Label><Label wide>Notes<textarea name="notes"/></Label></>:<><Label>Depth (m)<input name="depth" required type="number" min="0" step="any"/></Label><Label>Azimuth (degrees)<input name="azimuth" required type="number" min="0" max="359.999" step="any"/></Label><Label>Dip (degrees)<input name="dip" required type="number" min="-90" max="90" step="any"/></Label></>}<button type="submit" disabled={locked}>Save downhole record</button></form></details>;
}
function ReceiptCard({dispatch,project,locked,onSave}){
  const [received,setReceived]=useState(dispatch.receivedRecordIds||[]),[reference,setReference]=useState('');
  return <details className="mxf-card"><summary>{dispatch.id} · {dispatch.laboratory} · {dispatch.status}</summary><p>{dispatch.receivedRecordIds.length}/{dispatch.sampleRecordIds.length} bags received</p><form onSubmit={e=>{e.preventDefault();if(onSave(received,reference))setReference('');}}>{dispatch.sampleRecordIds.map(id=><label className="mxf-check" key={id}><input type="checkbox" checked={received.includes(id)} disabled={locked||dispatch.receivedRecordIds.includes(id)} onChange={e=>setReceived(prev=>e.target.checked?[...prev,id]:prev.filter(x=>x!==id))}/>{project.samples.find(s=>s.recordId===id)?.id||'Missing sample record'}</label>)}<Label>Receipt reference<input required value={reference} onChange={e=>setReference(e.target.value)}/></Label><button type="submit" disabled={locked}>Record laboratory receipt</button></form></details>;
}

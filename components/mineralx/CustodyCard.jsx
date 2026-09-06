'use client';
import {useState} from 'react';
import {today,downloadText} from './project-store.js';
import {csvRow} from './csv.js';

export default function CustodyCard({dispatch,project,locked,onShip,onReceipt,onResolve,reviewer}){
  const [received,setReceived]=useState(dispatch.receivedRecordIds||[]),[reference,setReference]=useState(''),[tracking,setTracking]=useState(''),[date,setDate]=useState(today),[exception,setException]=useState(''),[resolution,setResolution]=useState('');
  const prepared=dispatch.status==='prepared';
  const exportManifest=()=>downloadText(`${dispatch.id}-manifest.csv`,[
    csvRow(['dispatch','laboratory','bag_id','sample_record_id','sample_type','qaqc_type','hole_id','from_m','to_m']),
    ...dispatch.sampleRecordIds.map(id=>{const s=project.samples.find(s=>s.recordId===id)||{};return csvRow([dispatch.id,dispatch.laboratory,s.id||'MISSING',id,s.sampleType||'',s.qaqcType||'',s.holeId||'',s.from??'',s.to??'']);})
  ].join('\r\n'));
  return <details className="mxf-card"><summary>{dispatch.id} · {dispatch.laboratory} · {dispatch.status}</summary>
    <p>{dispatch.receivedRecordIds?.length||0}/{dispatch.sampleRecordIds.length} bags received. {prepared?'Manifest only: shipment has not been recorded.':''}</p>
    <button type="button" onClick={exportManifest}>Export dispatch manifest</button>
    {prepared?<form className="mxf-form" onSubmit={e=>{e.preventDefault();onShip(tracking,date);}}>
      <label className="mxf-label mxf-wide">Shipment / tracking reference<input required value={tracking} onChange={e=>setTracking(e.target.value)}/></label>
      <label className="mxf-label">Actual shipping date<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <button type="submit" className="mxf-primary" disabled={locked}>Record shipment</button>
    </form>:<form onSubmit={e=>{e.preventDefault();if(onReceipt(received,reference,exception.trim()?[{reason:exception.trim()}]:[])){setReference('');setException('');}}}>
      {dispatch.sampleRecordIds.map(id=><label className="mxf-check" key={id}><input type="checkbox" checked={received.includes(id)||dispatch.receivedRecordIds.includes(id)} disabled={locked||dispatch.receivedRecordIds.includes(id)} onChange={e=>setReceived(prev=>e.target.checked?[...prev,id]:prev.filter(x=>x!==id))}/>{project.samples.find(s=>s.recordId===id)?.id||'Missing sample record'}</label>)}
      <label className="mxf-label">Receipt reference<input required value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label className="mxf-label">Receipt exceptions / extra or damaged bags<textarea value={exception} onChange={e=>setException(e.target.value)} placeholder="Leave blank only when no exception was reported."/></label>
      <button type="submit" disabled={locked}>Record laboratory receipt</button>
    </form>}
    {(dispatch.receiptEvents||[]).map(event=><div key={event.recordId||event.at} className="mxf-message"><strong>{event.reference}</strong><p>{event.receivedRecordIds.length} bags acknowledged · {event.at}</p>
      {event.exceptions?.map((ex,i)=><p key={i}>{ex.reason}</p>)}
      {!!event.exceptions?.length&&!dispatch.exceptionResolutions?.some(r=>r.eventRecordId===event.recordId)&&<form onSubmit={e=>{e.preventDefault();if(onResolve(event.recordId,reviewer,resolution))setResolution('');}}>
        <p>This exception blocks release. Enter the reviewing geologist below and record how it was resolved. Missing bags remain outstanding.</p>
        <label className="mxf-label">Resolution evidence<input required value={resolution} onChange={e=>setResolution(e.target.value)}/></label><button disabled={locked||!reviewer.trim()}>Resolve receipt exception</button>
      </form>}
    </div>)}
    {!!dispatch.exceptionResolutions?.length&&<details><summary>Resolution history</summary><pre>{JSON.stringify(dispatch.exceptionResolutions,null,2)}</pre></details>}
  </details>;
}

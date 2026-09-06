"use client";
import React, { useEffect, useRef, useState } from "react";
import { usePlanGestures } from './usePlanGestures';
import { useReviewNotes } from './useReviewNotes';
import { ReviewNotes, anchorName } from './ReviewNotes';
import type { Anchor, NoteDraft, ReviewNote } from '@/lib/plant/notes';
import { distance, gestureView, type Point } from '@/lib/plant/viewport';
import { Button } from './Controls';
import {
  palette,
  groupNames,
  pointsText,
  planKml,
  type PlantModel,
} from "@/lib/plant/model";

type View = { x: number; y: number; w: number; h: number };
type Tab = "plan" | "equipment" | "basis" | "notes";
const routeLayers: Record<string, string> = {
  conveyor: "Conveyors",
  slurry: "Slurry pipes",
  water: "Water",
  chute: "Chutes",
  loader: "Loader routes",
  manual: "Manual transfers",
};
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PlantDashboard({ model, notesEndpoint='/api/notes' }: { model: PlantModel; notesEndpoint?:string }) {
  const full: View = {
    x: -5,
    y: -7,
    w: model.width + 10,
    h: model.height + 14,
  };
  const [view, setView] = useState<View>(full),
    [tab, setTab] = useState<Tab>("plan");
  const [selected, setSelected] = useState(""),
    [streamId, setStreamId] = useState(""),
    [traceId, setTraceId] = useState("");
  const [search, setSearch] = useState(""),
    [labels, setLabels] = useState(true),
    [access, setAccess] = useState(true),
    [envelopes, setEnvelopes] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    conveyor: true,
    slurry: true,
    water: false,
    chute: true,
    loader: true,
    manual: true,
  });
  const svg = useRef<SVGSVGElement>(null);
  const [tool,setTool]=useState<'pan'|'measure'|'pin'>('pan');
  const [measurement,setMeasurement]=useState<Point[]>([]);
  const [expanded,setExpanded]=useState(false),[sideNotes,setSideNotes]=useState(false);
  const [showPins,setShowPins]=useState(true),[activeNote,setActiveNote]=useState('');
  const [draft,setDraft]=useState<NoteDraft|null>(null);
  const notes=useReviewNotes(notesEndpoint);
  useEffect(()=>{if(tab!=='plan')setExpanded(false);},[tab]);
  useEffect(()=>{
    if(typeof window==='undefined')return;
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setExpanded(false);setTool('pan');}};
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[]);
  useEffect(()=>{if(!expanded)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return ()=>{document.body.style.overflow=previous;};},[expanded]);
  const trace = model.traces.find((t) => t.id === traceId),
    equipment = model.equipment.find((e) => e.id === selected),
    stream = model.streams.find((s) => s.id === streamId);
  const activeRoutes = new Set(trace?.streams || []);
  const activeEquipment = new Set(
    model.streams
      .filter((s) => activeRoutes.has(s.id))
      .flatMap((s) => [s.source, s.target]),
  );
  const register = model.equipment.filter((e) =>
    `${e.id} ${e.name} ${e.group}`.toLowerCase().includes(search.toLowerCase()),
  );
  const connections = equipment
    ? model.streams.filter(
        (s) => s.source === equipment.id || s.target === equipment.id,
      )
    : [];
  const nameOf = (id: string) =>
    model.equipment.find((e) => e.id === id)?.name || id.replaceAll("_", " ");
  const choose = (id: string) => {
    setSelected(id);
    setStreamId("");
    setSideNotes(false);
  };
  const zoom = (factor: number) =>
    setView((v) => {
      const w = Math.min(full.w * 1.3, Math.max(12, v.w * factor));
      const h = (w * v.h) / v.w;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  const fitEquipment = (id: string) => {
    const e = model.equipment.find((e) => e.id === id);
    if (!e) return;
    choose(id);
    setTab("plan");
    const w = Math.max(20, e.w + 12),
      h = (w * full.h) / full.w;
    setView({
      x: e.x + e.w / 2 - w / 2,
      y: model.height - e.y - e.h / 2 - h / 2,
      w,
      h,
    });
  };
  const exportSvg = () => {
    if (!svg.current) return;
    const copy = svg.current.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1600");
    copy.setAttribute("height", String(Math.round((1600 * view.h) / view.w)));
    copy.querySelectorAll("[data-hit]").forEach((e) => e.remove());
    download(
      `plant-${model.revision}.svg`,
      new XMLSerializer().serializeToString(copy),
      "image/svg+xml",
    );
  };
  const anchorFor = (type: 'equipment'|'route', id: string): Anchor => {
    const q=model.equipment.find(e=>e.id===id);
    const route=model.streams.find(e=>e.id===id);
    const point=q?[q.x+q.w/2,q.y+q.h/2]:route?.points[Math.floor(route.points.length/2)]||[0,0];
    return {type,id,x:point[0],y:point[1],revision:model.revision};
  };
  const beginNote=(anchor:Anchor)=>{
    if(draft){setSideNotes(true);return;}
    setDraft({id:crypto.randomUUID(),body:'',priority:'normal',anchor});setSideNotes(true);setTool('pan');setShowPins(true);
  };
  const locateNote=(note:ReviewNote)=>{
    const a=note.anchor.type==='point'?note.anchor:anchorFor(note.anchor.type,note.anchor.id!);
    setTab('plan');setSideNotes(true);setActiveNote(note.id);setShowPins(true);
    setView({x:a.x-15,y:model.height-a.y-15*full.h/full.w,w:30,h:30*full.h/full.w});
  };
  const onTap=(point:Point,target:Element)=>{
    const local={x:point.x,y:model.height-point.y};
    const qid=target.closest('[data-equipment-id]')?.getAttribute('data-equipment-id');
    const rid=target.closest('[data-route-id]')?.getAttribute('data-route-id');
    const nid=target.closest('[data-note-id]')?.getAttribute('data-note-id');
    if(tool==='measure'){
      if(local.x>=0&&local.x<=model.width&&local.y>=0&&local.y<=model.height)setMeasurement(old=>old.length===1?[...old,local]:[local]);
      return;
    }
    if(tool==='pin'){
      if(local.x<0||local.x>model.width||local.y<0||local.y>model.height)return;
      beginNote(qid?anchorFor('equipment',qid):rid?anchorFor('route',rid):{type:'point',id:null,x:Number(local.x.toFixed(2)),y:Number(local.y.toFixed(2)),revision:model.revision});return;
    }
    if(nid){const n=notes.notes.find(n=>n.id===nid);if(n){setActiveNote(nid);setSideNotes(true);}return;}
    if(qid){choose(qid);return;}
    if(rid){setStreamId(rid);setSelected('');setSideNotes(false);return;}
  };
  const gestures=usePlanGestures(svg,view,setView,full.w*1.5,tab==='plan',onTap);
  const notePanel=(scoped=false)=><ReviewNotes store={notes} model={model} draft={draft} setDraft={setDraft} activeId={activeNote} onLocate={locateNote} onPin={()=>{setTab('plan');setTool('pin');setSideNotes(false);}} scope={scoped?(selected||streamId||undefined):undefined}/>;
  const pinScale=view.w/full.w;
  return (
    <main id="main-content" className="plant-main">
      <div className="plant-heading">
        <div>
          <p className="plant-eyebrow">
            Engineering workspace <span>/ Processing plant</span>
          </p>
          <h1>{model.title}</h1>
          <p className="plant-subtitle">
            {model.subtitle} <span>•</span> North-up plan · metres
          </p>
        </div>
        <div className="plant-heading-meta">
          <span className="plant-pill">{model.status}</span>
          <span className="plant-revision">
            REV {model.revision} <span>·</span>{" "}
            {Math.abs(model.translation_from_P1_m[1])} m south of P1
          </span>
        </div>
      </div>
      <div className="plant-summary">
        <div>
          <span>Plant reservation</span>
          <strong>
            {model.width} × {model.height}
            <small> m</small>
          </strong>
        </div>
        <div>
          <span>Equipment footprints</span>
          <strong>
            {model.equipment.length}
            <small> items</small>
          </strong>
        </div>
        <div>
          <span>Scheduled connections</span>
          <strong>
            {model.streams.length}
            <small> routes</small>
          </strong>
        </div>
        <div>
          <span>Review before installation</span>
          <button onClick={() => setTab("basis")}>
            <strong>
              {model.holds.length}
              <small> design holds ↗</small>
            </strong>
          </button>
        </div>
      </div>
      <div
        className="plant-tabs"
        role="tablist"
        aria-label="Plant workspace view"
      >
        {(
          [
            ["plan", "Site plan"],
            ["equipment", "Equipment register"],
            ["basis", "Layout reasoning"],
            ["notes", `Review notes (${notes.notes.filter(n=>n.status==='open').length})`],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
        <div className="plant-export">
          <button
            onClick={() =>
              download(
                `plant-${model.revision}.kml`,
                planKml(model),
                "application/vnd.google-earth.kml+xml",
              )
            }
          >
            ↓ Google Earth KML
          </button>
          {tab === "plan" && <button onClick={exportSvg}>↓ Vector SVG</button>}
        </div>
      </div>
      {tab === "plan" && (
        <section role="tabpanel" id="panel-plan" aria-labelledby="tab-plan">
          <div className="plant-flowbar">
            <span className="plant-eyebrow">Trace circuit</span>
            <button aria-pressed={!traceId} onClick={() => setTraceId("")}>
              All circuits
            </button>
            {model.traces.map((t) => (
              <button
                key={t.id}
                aria-pressed={traceId === t.id}
                onClick={() => {
                  setTraceId(t.id);
                  setSelected("");
                  setStreamId("");
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="plant-trace-note" role="status">
            <span className="plant-check">✓</span>
            <p>
              {trace ? trace.description : model.traces[0]?.description}
              <small>
                Flow checked against the source sheet; equipment and hydraulic
                arrangements remain at concept stage.
              </small>
            </p>
          </div>
          <div className={`plant-canvas-layout ${expanded?'is-expanded':''}`}>

            <div className="plant-drawing">
              <div className="plant-map-toolbar">
                <div>
                  <button onClick={() => setView(full)}>Fit site</button>
                  <button
                    onClick={() => setView(model.view_presets.wet)}
                  >
                    Wet circuit
                  </button>
                  <button
                    onClick={() => setView(model.view_presets.cleanup)}
                  >
                    Cleanup
                  </button>
                </div>
                <div>
                  <button aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'↙ Close expanded':'⛶ Expand'}</button>
                  <button aria-label="Zoom out" onClick={() => zoom(1.25)}>
                    −
                  </button>
                  <output aria-label="Zoom level">
                    {Math.round((full.w / view.w) * 100)}%
                  </output>
                  <button aria-label="Zoom in" onClick={() => zoom(0.8)}>
                    +
                  </button>
                </div>
              </div>
              <div className="plant-interaction-toolbar">
                <div role="group" aria-label="Drawing tool">
                  <Button variant="ghost" size="sm" aria-pressed={tool==='pan'} onClick={()=>setTool('pan')}>↔ Pan & select</Button>
                  <Button variant="ghost" size="sm" aria-pressed={tool==='measure'} onClick={()=>{setTool('measure');setMeasurement([]);}}>↗ Measure</Button>
                  <Button variant="ghost" size="sm" aria-pressed={tool==='pin'} disabled={!!draft} onClick={()=>setTool('pin')}>＋ Pin note</Button>
                </div>
                <button className="plant-notes-toggle" aria-pressed={sideNotes} onClick={()=>setSideNotes(v=>!v)}>Notes <span>{notes.notes.filter(n=>n.status==='open').length}</span></button>
              </div>
              {tool!=='pan'&&<div className="plant-tool-prompt" role="status">{tool==='pin'?'Select a machine, connection or point inside the yard to add a note.':measurement.length===0?'Select the first measurement point.':measurement.length===1?'Select the second point.':'Select another point to start a new measurement.'}<button onClick={()=>{setTool('pan');setMeasurement([]);}}>Done</button></div>}
              <svg
                ref={svg}
                className={`plant-svg tool-${tool}`}
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                tabIndex={0}
                role="group"
                aria-label="Interactive top view plant site plan. Select equipment or use the equipment register. Drag the background to pan."
                {...gestures}
                onDoubleClick={e=>{
                  if(tool!=='pan')return;
                  const p={x:e.clientX,y:e.clientY},bounds=e.currentTarget.getBoundingClientRect();
                  setView(v=>gestureView(v,bounds,p,p,.65,full.w*1.5));
                }}
                onKeyDown={e=>{
                  if(e.target!==e.currentTarget)return;
                  if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();
                  if(e.key==='+'||e.key==='=')zoom(.8);
                  if(e.key==='-')zoom(1.25);
                  if(e.key==='0')setView(full);
                  if(e.key.startsWith('Arrow'))setView(v=>({...v,x:v.x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)*v.w*.1,y:v.y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)*v.h*.1}));
                }}
              >
                <title>{`${model.title} — ${model.revision} — ${model.status}`}</title>
                <defs>
                  <pattern
                    id="plant-grid"
                    width="5"
                    height="5"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 5 0 L 0 0 0 5"
                      fill="none"
                      stroke="#dfe6e5"
                      strokeWidth=".06"
                    />
                  </pattern>
                  {Object.entries(palette).map(([key, color]) => (
                    <marker
                      key={key}
                      id={`arrow-${key}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="4"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path d="M0 0 L10 5 L0 10Z" fill={color} />
                    </marker>
                  ))}
                </defs>
                <rect
                  x={view.x}
                  y={view.y}
                  width={view.w}
                  height={view.h}
                  fill="#f9fbfa"
                />
                <rect
                  x="0"
                  y="0"
                  width={model.width}
                  height={model.height}
                  fill="url(#plant-grid)"
                  stroke="#647a78"
                  strokeWidth=".16"
                />
                <g transform={`translate(0 ${model.height}) scale(1 -1)`}>
                  {access && (
                    <g>
                      {model.roads.map((r, i) => (
                        <polygon
                          key={i}
                          points={pointsText(r)}
                          fill="#e6ebe9"
                          stroke="#bdcbc6"
                          strokeWidth=".08"
                        />
                      ))}
                      {model.zones.map((z) => (
                        <polygon
                          key={z.name}
                          points={pointsText(z.points)}
                          fill="#dce9e2"
                          fillOpacity=".24"
                          stroke="#95aba0"
                          strokeDasharray=".55 .4"
                          strokeWidth=".12"
                        >
                          <title>{z.name}</title>
                        </polygon>
                      ))}
                    </g>
                  )}
                  {model.streams
                    .filter((s) =>
                      trace ? activeRoutes.has(s.id) : layers[s.route_type],
                    )
                    .map((s) => {
                      const color = palette[s.kind] || palette.wet,
                        chosen = s.id === streamId;
                      return (
                        <g
                          key={s.id}
                          data-interactive="true"
                          data-route-id={s.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${s.id}: ${nameOf(s.source)} to ${nameOf(s.target)}, ${s.route_type}`}
                          onClick={() => {
                            setStreamId(s.id);
                            setSelected("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setStreamId(s.id);
                              setSelected("");
                            }
                          }}
                        >
                          <title>{`${s.id} · ${nameOf(s.source)} → ${nameOf(s.target)} · ${s.route_type}`}</title>
                          {s.route_type === "conveyor" && (
                            <polyline
                              points={pointsText(s.points)}
                              fill="none"
                              stroke="#dde3dd"
                              strokeWidth="1.2"
                            />
                          )}
                          {chosen && (
                            <polyline
                              points={pointsText(s.points)}
                              fill="none"
                              stroke="#172e2a"
                              strokeWidth=".85"
                            />
                          )}
                          <polyline
                            points={pointsText(s.points)}
                            fill="none"
                            stroke={color}
                            strokeWidth={
                              s.route_type === "conveyor" ? 0.36 : 0.2
                            }
                            strokeDasharray={
                              s.route_type === "water"
                                ? ".6 .3"
                                : s.route_type === "loader" ||
                                    s.route_type === "manual"
                                  ? ".7 .5"
                                  : undefined
                            }
                            markerEnd={`url(#arrow-${s.kind in palette ? s.kind : "wet"})`}
                          />
                          <polyline
                            data-hit="true"
                            points={pointsText(s.points)}
                            fill="none"
                            stroke="transparent"
                            strokeWidth=".9"
                          />
                        </g>
                      );
                    })}
                  {model.equipment.map((e) => {
                    const color = palette[e.group] || palette.service;
                    return (
                      <g
                        key={e.id}
                        data-interactive="true"
                        data-equipment-id={e.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${e.name}, ${e.w} by ${e.h} metres`}
                        aria-pressed={selected === e.id}
                        opacity={trace && !activeEquipment.has(e.id) ? 0.28 : 1}
                        onClick={() => choose(e.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            choose(e.id);
                          }
                        }}
                      >
                        <title>{`${e.name} · ${e.id} · ${e.w} × ${e.h} m · ${e.basis}`}</title>
                        {(envelopes || selected === e.id) && (
                          <rect
                            x={e.x - 0.15}
                            y={e.y - 0.15}
                            width={e.w + 0.3}
                            height={e.h + 0.3}
                            fill="none"
                            stroke={selected === e.id ? "#112e27" : "#82978c"}
                            strokeWidth={selected === e.id ? 0.28 : 0.1}
                            strokeDasharray={
                              selected === e.id ? undefined : ".35 .25"
                            }
                          />
                        )}
                        {e.symbol.map((s, i) => (
                          <polyline
                            key={i}
                            points={pointsText(s.points)}
                            fill={s.fill ? color : "none"}
                            stroke={s.fill ? color : "#ffffff"}
                            strokeWidth={s.fill ? 0.13 : 0.075}
                          />
                        ))}
                        <rect
                          data-hit="true"
                          x={e.x - 0.12}
                          y={e.y - 0.12}
                          width={e.w + 0.24}
                          height={e.h + 0.24}
                          fill="transparent"
                        />
                      </g>
                    );
                  })}
                </g>
                {labels &&
                  model.equipment.map((e) => {
                    const label = e.label;
                    if (!label?.[0] || ((e.id.startsWith("PP") || /^S0[2-6]$/.test(e.id)) && view.w > full.w / 1.8 && selected !== e.id)) return null;
                    return (
                      <g key={e.id} pointerEvents="none">
                        <rect
                          x={label[1] - (label[0].length * 0.5 + 0.8) / 2}
                          y={model.height - label[2] - 1.05}
                          width={label[0].length * 0.5 + 0.8}
                          height={1.4}
                          fill="#f9fbfa"
                          fillOpacity={0.92}
                        />
                        <text
                          x={label[1]}
                          y={model.height - label[2]}
                          textAnchor="middle"
                          fontSize="1.0"
                          fontFamily="Arial,sans-serif"
                          fontWeight="600"
                          fill="#273f39"
                          opacity={
                            trace && !activeEquipment.has(e.id) ? 0.4 : 1
                          }
                          pointerEvents="none"
                        >
                          {label[0]}
                        </text>
                      </g>
                    );
                  })}
                {labels&&model.streams.filter(s=>s.label&&(trace?activeRoutes.has(s.id):layers[s.route_type])).map(s=>{
                  const label=s.label!;
                  return <g key={`label-${s.id}`} pointerEvents="none"><rect x={label[1]-(label[0].length*.48+1)/2} y={model.height-label[2]-1.1} width={label[0].length*.48+1} height={1.5} fill="#f9fbfa" fillOpacity=".95"/><text x={label[1]} y={model.height-label[2]} textAnchor="middle" fontSize=".96" fontWeight="700" fontFamily="Arial,sans-serif" fill={palette[s.kind]}>{label[0]}</text></g>;
                })}
                {access && <g fill="#65796e" fontSize=".85" fontFamily="Arial,sans-serif" textAnchor="middle" pointerEvents="none">
                  {model.annotations.map(a=><text key={a.text} x={a.x} y={model.height-a.y} transform={a.rotation?`rotate(${-a.rotation} ${a.x} ${model.height-a.y})`:undefined}>{a.text}</text>)}
                </g>}
                {measurement.length>0&&<g pointerEvents="none">
                  {measurement.map((p,i)=><circle key={i} cx={p.x} cy={model.height-p.y} r={.4*pinScale} fill="#153bdf" stroke="white" strokeWidth={.16*pinScale}/>)}
                  {measurement.length===2&&<>
                    <path d={`M${measurement[0].x} ${model.height-measurement[0].y} L${measurement[1].x} ${model.height-measurement[1].y}`} stroke="#153bdf" strokeWidth={.22*pinScale} strokeDasharray={`${.6*pinScale} ${.4*pinScale}`}/>
                    <text x={(measurement[0].x+measurement[1].x)/2} y={model.height-(measurement[0].y+measurement[1].y)/2-1.1*pinScale} textAnchor="middle" fill="#143cca" fontSize={1.3*pinScale} fontWeight="700" stroke="white" strokeWidth={.45*pinScale} paintOrder="stroke">{distance(measurement[0],measurement[1]).toFixed(2)} m</text>
                  </>}
                </g>}
                {showPins&&notes.notes.filter(n=>(n.status==='open'||n.id===activeNote)&&(n.anchor.type!=='point'||n.anchor.revision===model.revision)).map(n=>{
                  const a=n.anchor.type==='point'?n.anchor:anchorFor(n.anchor.type,n.anchor.id!);
                  const duplicates=notes.notes.filter(other=>other.status==='open'&&other.anchor.type===n.anchor.type&&other.anchor.id===n.anchor.id&&other.anchor.x===n.anchor.x&&other.anchor.y===n.anchor.y);
                  const dx=(1.8+duplicates.findIndex(other=>other.id===n.id)*2.4)*pinScale;
                  return <g key={n.id} data-note-id={n.id} role="button" tabIndex={0} aria-label={`Note ${notes.notes.indexOf(n)+1}: ${n.body}`} onClick={()=>{setActiveNote(n.id);setSideNotes(true);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActiveNote(n.id);setSideNotes(true);}}}>
                    <title>{anchorName(n.anchor,model)}: {n.body}</title>
                    <path d={`M${a.x} ${model.height-a.y} l${dx} ${-2*pinScale}`} stroke="#bd651c" strokeWidth={.14*pinScale}/>
                    <circle cx={a.x+dx} cy={model.height-a.y-2*pinScale} r={1.05*pinScale} fill={n.status==='resolved'?'#687e6b':n.priority==='attention'?'#b74b22':'#235940'} stroke={activeNote===n.id?'#ffc45a':'white'} strokeWidth={.25*pinScale}/>
                    <text x={a.x+dx} y={model.height-a.y-1.62*pinScale} fill="white" fontSize={1.05*pinScale} textAnchor="middle" pointerEvents="none">{notes.notes.indexOf(n)+1}</text>
                  </g>;
                })}
                {draft&&<circle cx={draft.anchor.x} cy={model.height-draft.anchor.y} r={1.2*pinScale} fill="none" stroke="#245be0" strokeWidth={.25*pinScale} strokeDasharray={`${.5*pinScale} ${.3*pinScale}`} pointerEvents="none"/>}
                <g fill="#476359" fontSize="1" fontFamily="Arial,sans-serif">
                  <text x={model.width/2} y="-2.8" textAnchor="middle">
                    {model.width} m
                  </text>
                  <path
                    d={`M0 -1.5H${model.width} M0 -2.1V-.9 M${model.width} -2.1V-.9`}
                    stroke="#82998e"
                    strokeWidth=".12"
                  />
                  <text
                    x="-3"
                    y={model.height/2}
                    textAnchor="middle"
                    transform={`rotate(-90 -3 ${model.height/2})`}
                  >
                    {model.height} m
                  </text>
                  <path
                    d={`M${model.width-4} -3 V-5 L${model.width-4.5} -4 M${model.width-4} -5 L${model.width-3.5} -4`}
                    stroke="#243e34"
                    strokeWidth=".18"
                  />
                  <text x={model.width-3} y="-4">
                    N
                  </text>
                  <path
                    d={`M0 ${model.height + 3}h10 M0 ${model.height + 2.5}v1 M5 ${model.height + 2.5}v1 M10 ${model.height + 2.5}v1`}
                    stroke="#243e34"
                    strokeWidth=".15"
                  />
                  <text x="0" y={model.height + 5}>
                    0
                  </text>
                  <text x="10" y={model.height + 5}>
                    10 m
                  </text>
                  <text
                    x={model.width}
                    y={model.height + 4}
                    textAnchor="end"
                    fontSize=".8"
                  >
                    {model.status} · REV {model.revision}
                  </text>
                </g>
              </svg>
              {measurement.length===2&&<div className="plant-measure-result" role="status"><strong>{distance(measurement[0],measurement[1]).toFixed(2)} m</strong><span>East/west {Math.abs(measurement[1].x-measurement[0].x).toFixed(2)} m · North/south {Math.abs(measurement[1].y-measurement[0].y).toFixed(2)} m · Horizontal plan distance</span><button onClick={()=>setMeasurement([])}>Clear</button></div>}
              <div className="plant-map-footer">
                <span>Scroll / pinch to zoom · drag to pan · double-click to zoom in</span>
                <span>Footprints to planning scale · line widths symbolic</span>
              </div>
            </div>
            <aside
              className="plant-inspector"
              aria-label="Plan controls and inspection"
            >
              {(sideNotes||draft)?<><button className="plant-back-inspector" onClick={()=>{setSideNotes(false);if(draft)setTab('notes');}}>← {draft?'Open draft in notes tab':'Equipment & layers'}</button>{notePanel()}</>:<>
              <div className="plant-inspector-title">
                <span className="plant-eyebrow">
                  {equipment
                    ? "Equipment details"
                    : stream
                      ? "Connection details"
                      : "Plan explorer"}
                </span>
                {(equipment || stream) && (
                  <button
                    aria-label="Clear selection"
                    onClick={() => {
                      setSelected("");
                      setStreamId("");
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              {equipment ? (
                <>
                  <span
                    className="plant-tag"
                    style={{ color: palette[equipment.group] }}
                  >
                    {equipment.id} ·{" "}
                    {groupNames[equipment.group] || equipment.group}
                  </span>
                  <h2>{equipment.name}</h2>
                  <div className="plant-dimensions">
                    <strong>
                      {equipment.w} × {equipment.h}
                      <small> m</small>
                    </strong>
                    <span>{equipment.basis}</span>
                  </div>
                  <p>{equipment.note}</p>
                  <button
                    className="plant-focus"
                    onClick={() => fitEquipment(equipment.id)}
                  >
                    Focus on this machine ↗
                  </button>
                  <Button variant="outline" className="plant-add-note" onClick={()=>beginNote(anchorFor('equipment',equipment.id))}>＋ Note on this machine</Button>
                  <h3>
                    Connections <span>{connections.length}</span>
                  </h3>
                  <ul className="plant-connections">
                    {connections.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => {
                            setStreamId(s.id);
                            setSelected("");
                          }}
                        >
                          <span>
                            {s.source === equipment.id ? "OUT" : "IN"} · {s.id}
                          </span>
                          {nameOf(
                            s.source === equipment.id ? s.target : s.source,
                          )}
                          <small>
                            {s.route_type} · {s.horizontal_route_m.toFixed(1)} m
                            plan route
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : stream ? (
                <>
                  <span className="plant-tag">
                    {stream.id} ·{" "}
                    {routeLayers[stream.route_type] || stream.route_type}
                  </span>
                  <h2>
                    {nameOf(stream.source)}
                    <span className="plant-route-arrow">↓</span>
                    {nameOf(stream.target)}
                  </h2>
                  <div className="plant-dimensions">
                    <strong>
                      {stream.horizontal_route_m.toFixed(1)}
                      <small> m</small>
                    </strong>
                    <span>Horizontal centreline length</span>
                  </div>
                  <p>{stream.note}</p>
                  <p className="plant-caption">
                    No pipe diameter, elevation or pump head is implied by this
                    line.
                  </p>
                  <Button variant="outline" className="plant-add-note" onClick={()=>beginNote(anchorFor('route',stream.id))}>＋ Note on this connection</Button>
                  <div className="plant-endpoints">
                    {[stream.source, stream.target]
                      .filter((id) => model.equipment.some((e) => e.id === id))
                      .map((id) => (
                        <button key={id} onClick={() => choose(id)}>
                          {nameOf(id)} ↗
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <>
                  <h2>Explore the arrangement</h2>
                  <p>
                    Select a solid machine symbol to inspect its size, purpose
                    and upstream/downstream connections.
                  </p>
                  <label className="plant-search">
                    Find equipment
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search machine or tag…"
                    />
                  </label>
                  {search && (
                    <ul className="plant-search-results">
                      {register.map((e) => (
                        <li key={e.id}>
                          <button onClick={() => fitEquipment(e.id)}>
                            {e.name}
                            <small>{e.id}</small>
                          </button>
                        </li>
                      ))}
                      {!register.length && <li>No equipment found.</li>}
                    </ul>
                  )}
                </>
              )}
              <div className="plant-layer-section">
                <h3>Drawing layers</h3>
                {trace && (
                  <p className="plant-caption">
                    Trace mode shows the selected circuit. Choose “All circuits”
                    to use the route layers.
                  </p>
                )}
                <div className="plant-layer-options">
                  <label><input type="checkbox" checked={showPins} onChange={e=>setShowPins(e.target.checked)}/>Review note pins</label>
                  {Object.entries(routeLayers).map(([id, name]) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={layers[id]}
                        disabled={!!trace}
                        onChange={(e) =>
                          setLayers((v) => ({ ...v, [id]: e.target.checked }))
                        }
                      />
                      {name}
                    </label>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={labels}
                      onChange={(e) => setLabels(e.target.checked)}
                    />
                    Machine labels
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={access}
                      onChange={(e) => setAccess(e.target.checked)}
                    />
                    Access & reservations
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={envelopes}
                      onChange={(e) => setEnvelopes(e.target.checked)}
                    />
                    Equipment envelopes
                  </label>
                </div>
              </div>
              <div className="plant-legend">
                {Object.entries(groupNames).map(([id, name]) => (
                  <span key={id}>
                    <i style={{ background: palette[id] }} />
                    {name}
                  </span>
                ))}
              </div>
            </>}
            </aside>
          </div>
        </section>
      )}
      {tab === "notes" && <section role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" className="plant-notes-page">{notePanel()}</section>}
      {tab === "equipment" && (
        <section
          role="tabpanel"
          id="panel-equipment"
          aria-labelledby="tab-equipment"
          className="plant-register"
        >
          <div className="plant-section-heading">
            <div>
              <h2>Equipment register</h2>
              <p>
                Scheduled footprints and assumptions linked to the site plan.
              </p>
            </div>
            <label className="plant-search">
              Find equipment
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or tag…"
              />
            </label>
          </div>
          <div className="plant-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Circuit</th>
                  <th>Footprint</th>
                  <th>Dimension basis</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {register.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.name}</strong>
                      <small>{e.id}</small>
                    </td>
                    <td>
                      <span
                        className="plant-table-dot"
                        style={{ background: palette[e.group] }}
                      />
                      {groupNames[e.group] || e.group}
                    </td>
                    <td>
                      {e.w} × {e.h} m
                    </td>
                    <td>{e.basis}</td>
                    <td>
                      <button
                        onClick={() => fitEquipment(e.id)}
                        aria-label={`Locate ${e.name}`}
                      >
                        Locate ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!register.length && (
              <p className="plant-empty">No machines match your search.</p>
            )}
          </div>
        </section>
      )}
      {tab === "basis" && (
        <section
          role="tabpanel"
          id="panel-basis"
          aria-labelledby="tab-basis"
          className="plant-basis"
        >
          <div className="plant-section-heading">
            <div>
              <p className="plant-eyebrow">Review register</p>
              <h2>Design basis & outstanding decisions</h2>
              <p>
                The plan records a proposed arrangement. These items remain open
                before detailed design.
              </p>
            </div>
            <span className="plant-pill">{model.holds.length} open holds</span>
          </div>
          <div className="plant-layout-reasoning">
            <h2>Why this arrangement?</h2>
            <p>The earlier compact layout kept return routes close. P4 opens out the main process west to east while keeping the wet circuit together. The yard centre and 70 m south move are retained.</p>
            <div>{model.layout_reasoning.map(r=><article key={r.title}><h3>{r.title}</h3><p>{r.detail}</p></article>)}</div>
          </div>
          <div className="plant-holds">
            {model.holds.map((h, i) => (
              <article key={h.title}>
                <span className="plant-hold-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{h.title}</h3>
                  <p>{h.detail}</p>
                </div>
                <span className="plant-open">Open</span>
              </article>
            ))}
          </div>
          <div className="plant-source-section">
            <h2>Source documents</h2>
            <p>
              Original project correspondence, boundary file and technical
              references.
            </p>
            <ul>
              {model.source_links.map(([name, url]) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {name} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <footer className="plant-bottom">
        <span>
          MINERALX <b>/</b> Processing plant workspace
        </span>
        <span>
          Design information · {model.revision} · {model.status}
        </span>
      </footer>
    </main>
  );
}

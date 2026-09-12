'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import plan from '@/data/plant-p5.json';
import {plantSchema,type PlantModel} from '@/lib/plant/model';
import {applyPlantDesignOperations} from '@/lib/plant/design';

const PlantCadSurface=dynamic(()=>import('@/components/plant/PlantCadSurface'),{ssr:false,loading:()=> <div className="cad-workspace"><p role="status">Loading 3D plant model…</p></div>});
const baseModel=plantSchema.parse(plan);

type ProposalPayload={record:any;model:PlantModel;validation:any};

export default function EngineeringCadPreview({scopeId,changesetId,draft}:{scopeId:string;changesetId:string|null;draft:string|null}){
 const instant=useMemo(()=>{
  if(!draft)return null;
  try{
   const applied=applyPlantDesignOperations(baseModel,JSON.parse(draft));
   return applied.validation.ok?{model:applied.model,validation:applied.validation,error:''}:{model:baseModel,validation:applied.validation,error:'This instant design preview contains blocking spatial conflicts.'};
  }catch{return {model:baseModel,validation:null,error:'This ChatGPT design preview could not be validated.'};}
 },[draft]);
 const [proposal,setProposal]=useState<ProposalPayload|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!changesetId||draft){setProposal(null);setError('');setLoading(false);return;}
  let cancelled=false;setLoading(true);setError('');
  fetch(`/api/ops/engineering-design?scope=${encodeURIComponent(scopeId)}&id=${encodeURIComponent(changesetId)}`,{cache:'no-store',credentials:'same-origin'})
   .then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message||'The design proposal could not be opened.');return payload as ProposalPayload;})
   .then(payload=>{if(!cancelled)setProposal(payload);})
   .catch(caught=>{if(!cancelled)setError((caught as Error).message);})
   .finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[changesetId,draft,scopeId]);
 const activeModel=instant?.model||proposal?.model||baseModel;
 const proposalRecord=proposal?.record;
 const isPreview=!!draft||!!changesetId;
 return <div className="engineering-cad-preview">
  {isPreview&&<div className={`engineering-proposal-strip ${(instant?.error||error)?'has-error':''}`} role="status">
   <div><span className="ops-eyebrow">{draft?'ChatGPT design preview':proposalRecord?'Governed design proposal':'Opening design proposal'}</span><strong>{draft?'Unsaved conversational geometry':proposalRecord?.title||'Loading proposal…'}</strong>{draft&&instant?.validation&&<small>{instant.validation.affectedEquipment.length} equipment · {instant.validation.affectedStreams.length} routes affected</small>}{proposalRecord?.rationale&&<small>{proposalRecord.rationale}</small>}{loading&&<small>Loading validated design changes…</small>}{(instant?.error||error)&&<small className="engineering-proposal-error">{instant?.error||error}</small>}</div>
   <Link href={`/ops/plant?scope=${scopeId}&view=engineering&surface=cad`}>Return to P5 basis</Link>
  </div>}
  <PlantCadSurface model={activeModel}/>
 </div>;
}

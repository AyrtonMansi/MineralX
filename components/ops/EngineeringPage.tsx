'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {mayNavigate} from './navigation';
import {Empty} from './primitives';
import {useOperations} from './OperationsProvider';
import {useWorkflow,WorkflowEditor,WorkflowState} from './Workflow';
import EngineeringWorkspace from './EngineeringWorkspace';

const tabs=[['overview','Overview'],['engineering','Engineering'],['runs','Runs'],['assets','Equipment'],['maintenance','Maintenance'],['energy','Energy'],['spares','Critical spares']];

export default function EngineeringPage(){
 const {scope,development}=useOperations(),query=useSearchParams(),{data,error,loading}=useWorkflow(),[editor,setEditor]=useState<any>(null);
 if(!scope||scope.kind!=='facility')return <Empty title={development?'Opening Processing':'Choose a processing facility'}>{development?'Processing opens the compatible records in your Development workspace automatically.':'A geological project is not a processing boundary. Select the facility in the header.'}</Empty>;
 if(!scope.permissions.includes('plant.read'))return <Empty title="Processing access is not assigned">Use the workspaces available to your role.</Empty>;
 const view=query.get('view')||'engineering';
 const navigation=<nav className="ops-tabs" aria-label="Processing workspace">{tabs.map(([key,label])=><Link key={key} href={`/ops/plant?scope=${scope.id}&view=${key}`} aria-label={key==='runs'?'Processing':undefined} aria-current={view===key?'page':undefined}>{label}</Link>)}</nav>;
 const write=scope.permissions.includes('plant.capture');
 const edit=(kind:string,record?:any,initial?:any)=>{if(!mayNavigate())return;setEditor({kind,record,initial});};
 return <>{navigation}<WorkflowState data={data} error={error} loading={loading}/>
  {editor&&data?<WorkflowEditor key={`${editor.kind}:${editor.record?.id||'new'}`} {...editor} data={data} onClose={()=>setEditor(null)}/>:<EngineeringWorkspace data={data} write={write} edit={edit}/>} 
 </>;
}

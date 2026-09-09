'use client';
import Link from 'next/link';
import {useOperations} from './OperationsProvider';
import {Status} from './primitives';
import {nextGoldAction} from '@/lib/ops/workflow-model';
import {actions} from './action-specs';
export default function GoldJourney({detail,onAction}:{detail:any;onAction:(key:string)=>void}){
 const {scope,context,development}=useOperations(),lot=detail.record,next=nextGoldAction(detail,scope?.policy),spec=next.key?actions[next.key]:null,can=spec&&scope?.permissions.includes(spec.permission);
 return <section className="ops-gold-journey" aria-label="Gold lot next action"><div className="ops-section-heading"><div><p className="ops-eyebrow">Next useful action</p><h2>{next.title}</h2><p>{next.description}</p></div>{spec&&can&&<button className="ops-primary" onClick={()=>onAction(next.key!)}>{spec.title}</button>}</div>{spec&&!can&&<p>Assigned to an authorised {spec.permission==='gold.review'?'gold reviewer':'gold recorder'}. <Link href={`/ops/work?scope=${scope?.id}&action=task`}>Record the handover</Link> without duplicating the gold measurement.</p>}{spec?.mfa&&development&&<p className="ops-muted">This step requires a named staff account. Development access does not provide approval or custody authority.</p>}
 <div className="ops-gold-states"><div><span>Physical lot</span><strong>{lot.form?.replaceAll('_',' ')||'Recorded'}</strong><small>{detail.weights?.length?'Weight observation recorded':'Weight not recorded'}</small></div><div><span>Content evidence</span><Status>{lot.review_state}</Status><small>{detail.assays?.length?'Certificate recorded':'Assay pending'}</small></div><div><span>Production</span><strong>{detail.production?'Recognised':'Not recognised'}</strong><small>Transformations are not new production</small></div><div><span>Custody</span><strong>{detail.custody?.status||'Restricted / not assigned'}</strong><small>Dispatch and receiving acknowledgement are separate</small></div></div></section>;
}

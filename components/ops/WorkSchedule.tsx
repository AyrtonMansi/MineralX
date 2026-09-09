'use client';
import {useState} from 'react';
import Link from 'next/link';
import {localDay,taskDue} from '@/lib/ops/workflow-model';
import {useOperations} from './OperationsProvider';
/** Calendar dates, not elapsed shift hours. Schedule never changes predecessor state. */
export default function WorkSchedule({tasks}:{tasks:any[]}){
 const {scope}=useOperations();const [start,setStart]=useState(()=>localDay(scope?.timezone||'Australia/Brisbane'));
 const base=Date.parse(start+'T00:00:00Z'),days=Array.from({length:14},(_,i)=>new Date(base+i*86400000).toISOString().slice(0,10));
 const scheduled=tasks.filter(t=>t.start_on||taskDue(t,scope!.timezone)),unscheduled=tasks.length-scheduled.length;
 return <section className="ops-card" aria-label="Fourteen day work schedule"><div className="ops-section-heading"><div><h2>Next fourteen days</h2><p>Planned windows and due dates. Dependencies are shown in the work sequence; dates do not imply completion.</p></div><label>Window starts<input type="date" value={start} onChange={e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))setStart(e.target.value);}}/></label></div>
 <div className="ops-table-scroll"><table className="ops-schedule"><thead><tr><th scope="col">Task / planned dates</th>{days.map(d=><th scope="col" key={d}><time dateTime={d}>{d.slice(8)}<small>{d.slice(5,7)}</small></time></th>)}</tr></thead><tbody>{scheduled.map(t=>{const due=taskDue(t,scope!.timezone),from=t.start_on||due,to=due||from;return <tr key={t.id}><th scope="row"><Link href={`/ops/work?scope=${scope?.id}&item=${t.id}`}>{t.title}</Link><small>{from} → {to} · {t.status.replaceAll('_',' ')}</small></th>{days.map(d=><td key={d}><span className={from<=d&&d<=to?`ops-schedule-bar ${['resolved','cancelled'].includes(t.status)?'finished':''}`:''} aria-label={from<=d&&d<=to?`${t.title}: planned ${d}`:undefined}>{d===due?'◆':''}</span></td>)}</tr>;})}</tbody></table></div>
 {!scheduled.length&&<p>No planned dates yet. Add a start or due date to a task.</p>}{unscheduled>0&&<p>{unscheduled} tasks have no dates and remain in the Work list.</p>}
 </section>;
}

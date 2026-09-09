'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { localDay, taskDue, blockers } from '@/lib/ops/workflow-model';
import { useOperations } from './OperationsProvider';
import { Heading, Message, Quantity, LinkTo, Empty, useResource } from './primitives';
import { mayNavigate } from './navigation';
import { ProgramCards, WorkflowEditor, WorkflowState, useWorkflow } from './Workflow';

function OperationalSummary() {
  const { scope, context } = useOperations();
  const { data, error, loading } = useResource(scope ? `dashboard?scope=${scope.id}` : null);
  if (!scope) return <><Heading title="Your work" description="No operational workspace is assigned yet." /><Empty title="Access is not a role approval">An administrator can create the project or facility and assign named responsibilities. Existing production records have not been moved.</Empty>{context?.organisations.some((organisation) => organisation.admin) && <LinkTo area="admin">Open access & settings</LinkTo>}</>;
  const canGeo = scope.permissions.includes('geo.read');
  const canPlant = scope.permissions.includes('plant.read');
  const canGold = scope.permissions.includes('gold.read');
  const canWork = scope.permissions.includes('work.read');
  return <>
    <Heading title={scope.name} description="What needs attention, and the records behind it." action={scope.kind === 'project' && scope.permissions.includes('geo.capture') ? <LinkTo area="geology" params="action=sample">Collect a sample →</LinkTo> : scope.kind === 'facility' && scope.permissions.includes('plant.capture') ? <LinkTo area="plant" params="action=run">Record a processing run →</LinkTo> : undefined} />
    {error && <Message error>{error}</Message>}
    {loading && <p role="status">Loading the current account…</p>}
    {data && <>
      <div className="ops-kpis">
        {canGold && data.gold && <LinkTo area="gold" params="view=production"><span>Confirmed fine gold · last 30 days</span><strong><Quantity value={data.gold.confirmed_fine_au_g} missing={data.gold.confirmed_lots === 0 ? 'No production recognised' : 'Unrecorded'} /></strong><small>{data.gold.confirmed_lots} recognised lots · source-linked</small></LinkTo>}
        {canGold && data.pending && <LinkTo area="gold" params="view=lots"><span>Output awaiting recognition</span><strong>{data.pending.lots} <small>lots</small></strong><small>{data.pending.unweighed} still need a weight observation</small></LinkTo>}
        {canPlant && data.processing && <LinkTo area="plant" params="view=runs"><span>Dry-basis feed · last 30 days</span><strong><Quantity value={data.processing.dry_t} unit="t" /></strong><small>{data.processing.basis_incomplete} feed entries lack a complete dry basis</small></LinkTo>}
        {canGeo && data.geology && <><LinkTo area="geology" params="view=samples"><span>Physical samples</span><strong>{data.geology.samples}</strong><small>One register from collection to analytical review</small></LinkTo><LinkTo area="geology" params="view=lab"><span>Laboratory exceptions</span><strong>{data.geology.receiptExceptions}</strong><small>Receipts requiring a decision</small></LinkTo></>}
        {canWork && <LinkTo area="work"><span>Assigned / open actions</span><strong>{data.openActions}</strong><small>Specific handovers, not a second task system</small></LinkTo>}
      </div>
      <section className="ops-card"><div className="ops-section-heading"><h2>Continue the work</h2><small>As of {new Date(data.asOf).toLocaleString('en-AU', { timeZone: scope.timezone })} · {scope.timezone}</small></div><div className="ops-work-links">{canPlant && data.processing && <><LinkTo area="plant" params="view=runs">{data.processing.drafts} run drafts to complete <span>→</span></LinkTo><LinkTo area="plant" params="view=runs">{data.processing.submitted} submitted runs <span>→</span></LinkTo></>}{canGeo && data.geology && <LinkTo area="geology" params="view=lab">{data.geology.stagedCertificates} certificates awaiting review <span>→</span></LinkTo>}{canGold && data.pending && <LinkTo area="gold" params="view=lots">Review physical output and missing evidence <span>→</span></LinkTo>}{canWork && <LinkTo area="work">Open operational handovers <span>→</span></LinkTo>}</div></section>
      {data.gold && <section className="ops-card"><h2>Production, not estimates</h2><p>Fine gold is derived from a selected measured mass and accepted assay. Purity is not recovery. Process transformations and custody movements are not new production.</p><p className="ops-muted">{data.recoveryNote}</p></section>}
    </>}
    <section className="ops-card"><h2>One record, fewer handovers</h2><p>Record observations where they happen. The same records feed review queues, inventory and reports; no separate dashboard entry is required.</p><div className="ops-actions">{scope.permissions.some((permission) => permission.startsWith('files.')) && <LinkTo area="files">Procedures & source evidence</LinkTo>}{canGeo && <LinkTo area="field">Prepare for offline work</LinkTo>}{scope.permissions.includes('report.read') && <LinkTo area="reports">Reporting & closed accounts</LinkTo>}</div></section>
  </>;
}

function FirstSteps({ data, scope, canWrite, onCreateProgram, onCreateTask }: { data: any; scope: { kind: string; id: string }; canWrite: boolean; onCreateProgram: () => void; onCreateTask: () => void }) {
  const programs = (data.programs || []).filter((program: any) => !['completed', 'cancelled'].includes(program.data?.state || program.state));
  const tasks = (data.tasks || []).filter((task: any) => !['resolved', 'cancelled'].includes(task.status));
  if (!programs.length) return <section className="ops-card ops-first-steps"><p className="ops-eyebrow">START HERE</p><h2>Set the work boundary before adding tasks.</h2><p>A work program gives a campaign, plant activity or field project one owner and one source of truth.</p><ol><li>Create the program and describe the outcome.</li><li>Add the first accountable action.</li><li>Capture the actual work in {scope.kind === 'project' ? 'Geology or Pits & stockpiles' : 'Plant or Gold'}.</li></ol>{canWrite ? <button className="ops-primary" onClick={onCreateProgram}>Create first work program</button> : <p className="ops-muted">You can review this workspace. A planning owner with write access can create the first program.</p>}</section>;
  if (!tasks.length) return <section className="ops-card ops-first-steps"><p className="ops-eyebrow">NEXT STEP</p><h2>Turn the plan into accountable work.</h2><p>Your program is active. Add the first task, assign a planning owner and set a due date when one is known.</p>{canWrite ? <button className="ops-primary" onClick={onCreateTask}>Create first task</button> : <p className="ops-muted">You can review the program. A planning owner with write access can add its first task.</p>}</section>;
  return null;
}

export default function Home() {
  const { scope, context } = useOperations();
  const { data, error, loading } = useWorkflow();
  const [editor, setEditor] = useState<string | null>(null);
  if (!scope) return <OperationalSummary />;
  const today = localDay(scope.timezone);
  const people = data?.people || [];
  const mine = people.filter((person: any) => person.user_id === context?.userId).map((person: any) => person.id);
  const tasks = (data?.tasks || []).filter((task: any) => !['resolved', 'cancelled'].includes(task.status));
  const myTasks = tasks.filter((task: any) => mine.includes(task.responsible_id) || task.assigned_to === context?.userId);
  const due = tasks.filter((task: any) => taskDue(task, scope.timezone) && String(taskDue(task, scope.timezone)) <= today);
  const blocked = tasks.filter((task: any) => task.status === 'blocked' || blockers(task, data).length);
  const canGeo = scope.permissions.includes('geo.read');
  const canPlant = scope.permissions.includes('plant.read');
  const canGold = scope.permissions.includes('gold.read');
  const createProgram = () => { if (mayNavigate()) setEditor('program'); };
  const createTask = () => { if (mayNavigate()) setEditor('task'); };

  return <>
    <Heading title={scope.name} description="Plan the work here. Continue it in the field, plant or gold register — without entering it twice." action={scope.permissions.includes('work.write') && <div className="ops-actions"><button className="ops-primary" disabled={!data} onClick={createProgram}>Create work program</button><button disabled={!data} onClick={createTask}>Create task</button></div>} />
    <WorkflowState data={data} error={error} loading={loading} />
    {editor && data && <WorkflowEditor key={editor} kind={editor} data={data} initial={editor === 'program' ? { type: scope.kind === 'project' ? 'drilling' : 'processing' } : {}} onClose={() => setEditor(null)} />}
    {data && !editor && <><FirstSteps data={data} scope={scope} canWrite={scope.permissions.includes('work.write')} onCreateProgram={createProgram} onCreateTask={createTask} /><div className="ops-home-grid"><section className="ops-card"><div className="ops-section-heading"><h2>My next actions</h2><Link href={`/ops/work?scope=${scope.id}`}>All work →</Link></div>{(myTasks.length ? myTasks : tasks.filter((task: any) => !task.responsible_id)).slice(0, 5).map((task: any) => <Link className="ops-task-line" key={task.id} href={`/ops/work?scope=${scope.id}&item=${task.id}`}><span><strong>{task.title}</strong><small>{taskDue(task, scope.timezone) || 'No due date'} · {task.responsible_id ? 'Assigned to you' : 'Unassigned team work'}</small></span><span>→</span></Link>)}{!myTasks.length && !tasks.length && <p className="ops-muted">No work is open yet. Start a program, then add the first accountable task.</p>}{!myTasks.length && tasks.length > 0 && <p className="ops-muted">No tasks are linked to your account. Assign planning personnel in <Link href={`/ops/work?scope=${scope.id}&view=people`}>People & workload</Link>; this never grants account access.</p>}</section><section className="ops-card"><h2>Needs attention</h2><Link className="ops-task-line" href={`/ops/work?scope=${scope.id}&filter=Due`}><strong>{due.length} due / overdue</strong><span>→</span></Link><Link className="ops-task-line" href={`/ops/work?scope=${scope.id}&filter=Blocked`}><strong>{blocked.length} blocked</strong><span>→</span></Link><Link className="ops-task-line" href={`/ops/work?scope=${scope.id}&filter=Unassigned`}><strong>{tasks.filter((task: any) => !task.responsible_id && !task.assigned_to).length} unassigned</strong><span>→</span></Link><div className="ops-actions">{scope.kind === 'project' ? canGeo && <Link href={`/ops/geology?scope=${scope.id}&view=map`}>Open Geology Globe</Link> : <>{canPlant && <Link href={`/ops/plant?scope=${scope.id}`}>Plant & engineering</Link>}{canGold && <Link href={`/ops/gold?scope=${scope.id}`}>Gold next actions</Link>}</>}</div></section></div><section className="ops-section-heading"><h2>Active programs</h2><Link href={`/ops/programs?scope=${scope.id}`}>All programs →</Link></section><ProgramCards data={data} scopeId={scope.id} limit={6} /><section className="ops-card"><h2>Coming up</h2><p className="ops-muted">Next 14 days · {scope.timezone}. Dates stay explicitly planned until observations establish completion.</p>{tasks.filter((task: any) => { const date = taskDue(task, scope.timezone); return date && date >= today && date <= localDay(scope.timezone, new Date(Date.now() + 14 * 864e5)); }).sort((left: any, right: any) => (taskDue(left, scope.timezone) || '').localeCompare(taskDue(right, scope.timezone) || '')).slice(0, 8).map((task: any) => <Link key={task.id} className="ops-task-line" href={`/ops/work?scope=${scope.id}&item=${task.id}`}><span>{task.title}</span><span>{taskDue(task, scope.timezone)}</span></Link>)}</section></>}
    <details className="ops-card"><summary>Operational totals & source records</summary><OperationalSummary /></details>
    <details className="ops-card"><summary>How work moves through MineralX</summary><p>Create a program to plan a campaign or project; use a task for a single action. Assign people and dates, then capture actual work in Geology or Plant. Gold records follow physical clean-ups, not forecasts. Each record has its own next action and source history.</p><p>Planning personnel do not create login accounts. Device workspace records stay on this browser; named shared work requires the commissioned backend. Download a backup before changing devices.</p></details>
  </>;
}

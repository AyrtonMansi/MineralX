'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {api, uploadEvidence} from '@/lib/ops/client';
import {OPS_FILE_MAX_BYTES, OPS_INTAKE_MAX_BYTES} from '@/lib/ops/contracts';
import {useOperations} from './OperationsProvider';
import {useEntryGuard} from './navigation';
import {Empty, Heading, Message, Status, useResource} from './primitives';

type IntakeStatus = 'received' | 'proposed' | 'approved' | 'completed';
type ProposalStatus = 'proposed' | 'approved' | 'completed';
type ProposalAction = 'classify' | 'summarize' | 'route_file' | 'create_draft' | 'update_record' | 'link_duplicate' | 'create_task';
type ReviewState = 'informational' | 'review_required' | 'blocked';
type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type ApprovalRequirement = 'none' | 'human' | 'human_mfa' | 'prohibited';
type WarningSeverity = 'info' | 'warning' | 'error';
type UploadPhase = 'queued' | 'uploading' | 'verified' | 'failed';

interface EvidenceRecord {
  id: string;
  version: number;
  name: string;
  family: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  status: string;
}

interface IntakeSource {
  fileId: string;
  family: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  scanStatus: 'pending' | 'clean';
  scanEngine: string;
  scannedAt: string | null;
  ordinal: number;
  sourceReference: string;
  attachedBy: string;
  attachedAt: string;
}

interface SourceLocator {
  page?: number;
  sheet?: string;
  rowStart?: number;
  rowEnd?: number;
  cell?: string;
  quote?: string;
}

interface SourceProvenance {
  fileId: string;
  sha256: string;
  locator?: SourceLocator;
}

interface ProposalWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  blocksAutomation: boolean;
  provenance: SourceProvenance[];
}

interface ClassificationProposal {
  kind: string;
  confidence: number;
  rationale: string;
  provenance: SourceProvenance[];
  warnings: ProposalWarning[];
}

interface RecordReference {
  scopeId: string;
  resource: string;
  id: string;
  expectedVersion: number;
}

interface MappingTarget {
  resource: string;
  operation: 'create' | 'update' | 'attach';
  action: string;
  record?: RecordReference;
  schemaVersion: number;
}

interface FieldMapping {
  source: SourceProvenance;
  targetPath: string;
  transform: string;
  confidence: number;
}

interface SchemaMappingProposal {
  target: MappingTarget;
  fields: FieldMapping[];
  confidence: number;
  warnings: ProposalWarning[];
}

interface FieldPatch {
  op: 'set' | 'remove';
  path: string;
  value?: unknown;
  confidence: number;
  rationale: string;
  provenance: SourceProvenance[];
}

interface DocumentProposal {
  fileId: string;
  sourceSha256: string;
  classification: ClassificationProposal;
  mapping: SchemaMappingProposal | null;
  patches: FieldPatch[];
  confidence: number;
  warnings: ProposalWarning[];
}

interface IntelligencePlan {
  generation: {
    kind: 'model' | 'deterministic';
    provider: string;
    model: string;
    promptVersion: string;
  };
  confidence: number;
  summary: string;
  warnings: ProposalWarning[];
  documents: DocumentProposal[];
}

interface ReviewViolation {
  code: string;
  documentIndex?: number;
  path?: string;
  message: string;
}

interface DocumentReview {
  fileId: string;
  state: ReviewState;
  risk: RiskLevel;
  approval: ApprovalRequirement;
  reasons: string[];
}

interface IntelligenceReview {
  valid: boolean;
  proposalOnly: true;
  policyVersion: string;
  state: ReviewState;
  risk: RiskLevel;
  approval: ApprovalRequirement;
  violations: ReviewViolation[];
  documents: DocumentReview[];
}

interface BoundedCommand {
  action: string;
  id: string;
  expected: number;
  payload: Record<string, unknown>;
}

interface IntelligencePayload {
  source?: 'planner' | 'deterministic_fallback';
  acceptedForReview?: boolean;
  failure?: 'planner_unavailable' | 'planner_output_invalid' | null;
  plan?: IntelligencePlan;
  review?: IntelligenceReview;
  commands?: BoundedCommand[];
}

interface IntelligenceCompletion {
  outcome?: string;
  summary?: string;
  actions?: Array<{requestId: string; action: string; id: string; version?: number; revision?: number}>;
}

interface IntelligenceProposal {
  id: string;
  version: number;
  action: ProposalAction;
  summary: string;
  payload: IntelligencePayload;
  status: ProposalStatus;
  proposedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string;
  completion: IntelligenceCompletion | null;
  completedAt: string | null;
}

interface IntelligenceEvent {
  sequence: number;
  type: string;
  principal: 'user' | 'service';
  actorId: string;
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  version: number;
  reason: string;
  recordedAt: string;
}

interface IntelligenceExecution {
  ordinal: number;
  requestId: string;
  command: BoundedCommand;
  receipt: Record<string, unknown>;
  actorId: string;
  executedAt: string;
  scopeRevision: number;
  recordedAt: string;
}

interface IntelligenceIntake {
  id: string;
  scopeId: string;
  version: number;
  status: IntakeStatus;
  title: string;
  instructions: string;
  createdBy: string;
  createdAt: string;
  proposedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  sources: IntakeSource[];
  proposal: IntelligenceProposal | null;
  events: IntelligenceEvent[];
  executions: IntelligenceExecution[];
}

interface IntelligenceSummaryProposal {
  id: string;
  version: number;
  action: ProposalAction;
  summary: string;
  status: ProposalStatus;
  acceptedForReview: boolean | null;
  reviewState: ReviewState | null;
}

interface IntelligenceSummary {
  id: string;
  scopeId: string;
  version: number;
  status: IntakeStatus;
  title: string;
  createdBy: string;
  createdAt: string;
  proposedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  sourceCount: number;
  proposal: IntelligenceSummaryProposal | null;
}

interface IntelligenceListPage {
  rows: IntelligenceSummary[];
  next: string | null;
}

interface IntakeMutationEnvelope {
  record: IntelligenceIntake;
}

type IntakeMutationResponse = IntelligenceIntake | IntakeMutationEnvelope;

interface CreateIntakeRequest {
  action: 'create';
  scopeId: string;
  intakeId: string;
  requestId: string;
  title: string;
  instructions: string;
  sources: Array<{fileId: string; sourceReference?: string}>;
}

interface AnalyzeIntakeRequest {
  action: 'analyze';
  scopeId: string;
  intakeId: string;
}

interface ApproveIntakeRequest {
  action: 'approve';
  scopeId: string;
  intakeId: string;
  proposalId: string;
  expectedVersion: number;
  requestId: string;
  reason: string;
}

interface ApplyIntakeRequest {
  action: 'apply';
  scopeId: string;
  intakeId: string;
  proposalId: string;
  expectedVersion: number;
  requestId: string;
}

interface QueuedFile {
  key: string;
  fingerprint: string;
  file: File;
  family: string;
  id: string;
  requestId: string;
  phase: UploadPhase;
  record?: EvidenceRecord;
  error?: string;
  retryable?: boolean;
}

const MAX_FILES = 20;
const ACCEPTED_FILES = '.pdf,.csv,.xlsx,.docx,.pptx,.txt,.json,.geojson,.kml,.kmz,.las,.laz,.jpg,.jpeg,.png,.webp';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const dateTime = new Intl.DateTimeFormat('en-AU', {dateStyle: 'medium', timeStyle: 'short'});
const familyLabels: Record<string, string> = {geo: 'Exploration', plant: 'Plant', gold: 'Gold', custody: 'Custody'};
const actionLabels: Record<ProposalAction, string> = {
  classify: 'Classify sources',
  summarize: 'Summarise sources',
  route_file: 'Organise files',
  create_draft: 'Create draft records',
  update_record: 'Update a record',
  link_duplicate: 'Link duplicate records',
  create_task: 'Create a task',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function verifiedEvidence(value: unknown): EvidenceRecord {
  if (!isRecord(value)
    || typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)
    || typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 240
    || typeof value.family !== 'string'
    || typeof value.media_type !== 'string'
    || typeof value.size_bytes !== 'number' || !Number.isInteger(value.size_bytes) || value.size_bytes < 1 || value.size_bytes > OPS_FILE_MAX_BYTES
    || typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)
    || typeof value.status !== 'string') {
    throw new Error('MineralX could not verify the uploaded file record. Keep the original and retry.');
  }
  if (value.status !== 'verified') throw new Error('The source upload has not passed integrity verification.');
  return {
    id: value.id,
    version: typeof value.version === 'number' ? value.version : 1,
    name: value.name,
    family: value.family,
    media_type: value.media_type,
    size_bytes: value.size_bytes,
    sha256: value.sha256,
    status: value.status,
  };
}

function mutationRecord(response: IntakeMutationResponse) {
  return 'record' in response ? response.record : response;
}

function summarizeIntake(intake: IntelligenceIntake): IntelligenceSummary {
  const review = intake.proposal?.payload.review;
  return {
    id: intake.id,
    scopeId: intake.scopeId,
    version: intake.version,
    status: intake.status,
    title: intake.title,
    createdBy: intake.createdBy,
    createdAt: intake.createdAt,
    proposedAt: intake.proposedAt,
    approvedAt: intake.approvedAt,
    completedAt: intake.completedAt,
    sourceCount: intake.sources.length,
    proposal: intake.proposal ? {
      id: intake.proposal.id,
      version: intake.proposal.version,
      action: intake.proposal.action,
      summary: intake.proposal.summary,
      status: intake.proposal.status,
      acceptedForReview: intake.proposal.payload.acceptedForReview ?? null,
      reviewState: review?.state ?? null,
    } : null,
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : dateTime.format(date);
}

function humanize(value: string) {
  const text = value.replaceAll('_', ' ').replaceAll('.', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function confidenceLabel(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 'Not scored';
  const percentage = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `${percentage}% ${percentage >= 80 ? 'high' : percentage >= 50 ? 'review' : 'low'}`;
}

function confidenceTone(value: number | undefined) {
  if (value === undefined || value >= 0.8) return 'neutral';
  return value >= 0.5 ? 'warning' : 'error';
}

function boundedValue(value: unknown) {
  if (value === undefined) return '—';
  let text: string;
  try { text = typeof value === 'string' ? value : JSON.stringify(value); }
  catch { text = 'Structured value'; }
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function locatorLabel(locator: SourceLocator | undefined) {
  if (!locator) return '';
  const parts: string[] = [];
  if (locator.page) parts.push(`page ${locator.page}`);
  if (locator.sheet) parts.push(`sheet ${locator.sheet}`);
  if (locator.cell) parts.push(locator.cell);
  else if (locator.rowStart) parts.push(locator.rowEnd && locator.rowEnd !== locator.rowStart ? `rows ${locator.rowStart}–${locator.rowEnd}` : `row ${locator.rowStart}`);
  return parts.join(' · ');
}

function warningKey(warning: ProposalWarning) {
  const sources = warning.provenance.map((source) => `${source.fileId}:${locatorLabel(source.locator)}`).join(',');
  return `${warning.code}:${warning.message}:${sources}`;
}

function proposalWarnings(proposal: IntelligenceProposal) {
  const plan = proposal.payload.plan;
  if (!plan) return [];
  const warnings = [
    ...plan.warnings,
    ...plan.documents.flatMap((document) => [
      ...document.classification.warnings,
      ...(document.mapping?.warnings || []),
      ...document.warnings,
    ]),
  ];
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = warningKey(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function proposalMutates(proposal: IntelligenceProposal) {
  return proposal.action !== 'classify' && proposal.action !== 'summarize';
}

function isGenericZip(file: File) {
  const name = file.name.toLowerCase();
  if (['.docx', '.xlsx', '.pptx', '.kmz'].some((extension) => name.endsWith(extension))) return false;
  return name.endsWith('.zip') || ['application/zip', 'application/x-zip-compressed'].includes(file.type.toLowerCase());
}

function presentationStatus(intake: IntelligenceIntake): {label: string; tone: string} {
  if (intake.status === 'received') return {label: 'Processing', tone: 'warning'};
  if (intake.status === 'approved') return {label: 'Approved', tone: 'warning'};
  if (intake.status === 'completed') return {label: intake.proposal && proposalMutates(intake.proposal) ? 'Applied' : 'Complete', tone: 'neutral'};
  if (intake.proposal?.payload.review?.state === 'blocked' || intake.proposal?.payload.acceptedForReview !== true) return {label: 'Blocked', tone: 'error'};
  return {label: 'Needs review', tone: 'warning'};
}

function summaryStatus(intake: IntelligenceSummary): {label: string; tone: string} {
  if (intake.status === 'received') return {label: 'Processing', tone: 'warning'};
  if (intake.status === 'approved') return {label: 'Approved', tone: 'warning'};
  if (intake.status === 'completed') {
    const mutates = intake.proposal && intake.proposal.action !== 'classify' && intake.proposal.action !== 'summarize';
    return {label: mutates ? 'Applied' : 'Complete', tone: 'neutral'};
  }
  if (intake.proposal?.reviewState === 'blocked' || intake.proposal?.acceptedForReview !== true) return {label: 'Blocked', tone: 'error'};
  return {label: 'Needs review', tone: 'warning'};
}

function Progress({status}: {status: IntakeStatus}) {
  const active = ({received: 0, proposed: 1, approved: 2, completed: 3} as const)[status];
  return <ol className="ops-intelligence-progress" aria-label="Intake progress">
    {['Received', 'Proposal', 'Approved', 'Applied'].map((label, index) => <li key={label} data-complete={index < active || undefined} data-current={index === active || undefined}>{label}</li>)}
  </ol>;
}

function Provenance({sources, references}: {sources: IntakeSource[]; references?: SourceProvenance[]}) {
  const cited = references?.length
    ? references.map((reference) => ({reference, source: sources.find((source) => source.fileId === reference.fileId)}))
    : sources.map((source) => ({source, reference: {fileId: source.fileId, sha256: source.sha256} as SourceProvenance}));
  return <ul className="ops-intelligence-provenance">
    {cited.map(({source, reference}, index) => <li key={`${reference.fileId}:${locatorLabel(reference.locator)}:${index}`}>
      <span>{source?.name || `Source ${reference.fileId.slice(0, 8)}`}</span>
      <small>{locatorLabel(reference.locator) || 'Whole file'} · SHA-256 {reference.sha256.slice(0, 12)}…{source?.scanStatus === 'clean' ? ` · clean scan${source.scanEngine ? ` (${source.scanEngine})` : ''}` : ''}</small>
    </li>)}
  </ul>;
}

function WarningList({warnings, violations, sources}: {warnings: ProposalWarning[]; violations: ReviewViolation[]; sources: IntakeSource[]}) {
  if (!warnings.length && !violations.length) return null;
  return <section className="ops-intelligence-warnings" aria-labelledby="intelligence-warning-heading">
    <h3 id="intelligence-warning-heading">Warnings and policy checks</h3>
    <ul>
      {warnings.map((warning) => <li key={warningKey(warning)} data-severity={warning.severity}>
        <div><strong>{humanize(warning.code)}</strong>{warning.blocksAutomation ? <span>Blocks approval</span> : null}</div>
        <p>{warning.message}</p>
        {warning.provenance.length ? <Provenance sources={sources} references={warning.provenance}/> : null}
      </li>)}
      {violations.map((violation) => <li key={`${violation.code}:${violation.path || ''}:${violation.documentIndex ?? ''}:${violation.message}`} data-severity="error">
        <div><strong>{humanize(violation.code)}</strong><span>Blocks approval</span></div>
        <p>{violation.message}{violation.path ? ` · ${violation.path}` : ''}</p>
      </li>)}
    </ul>
  </section>;
}

function DocumentReviewCard({document, source}: {document: DocumentProposal; source: IntakeSource | undefined}) {
  const references = [
    ...document.classification.provenance,
    ...(document.mapping?.fields.map((field) => field.source) || []),
    ...document.patches.flatMap((patch) => patch.provenance),
  ];
  return <article className="ops-intelligence-document">
    <header>
      <div><h3>{source?.name || `Source ${document.fileId.slice(0, 8)}`}</h3><p>{humanize(document.classification.kind)} · {document.classification.rationale}</p></div>
      <Status tone={confidenceTone(document.confidence)}>{confidenceLabel(document.confidence)}</Status>
    </header>
    {document.mapping ? <dl className="ops-intelligence-destination">
      <div><dt>Proposed destination</dt><dd>{humanize(document.mapping.target.resource)}</dd></div>
      <div><dt>Operation</dt><dd>{humanize(document.mapping.target.operation)}</dd></div>
      <div><dt>Controlled action</dt><dd>{document.mapping.target.action}</dd></div>
      {document.mapping.target.record ? <div><dt>Current record</dt><dd>{document.mapping.target.record.id.slice(0, 8)}… · version {document.mapping.target.record.expectedVersion}</dd></div> : null}
    </dl> : <p className="ops-muted">No record destination or data change is proposed for this source.</p>}
    {document.patches.length ? <div className="ops-intelligence-patches">
      <h3>Field changes</h3>
      {document.patches.map((patch) => <div key={`${patch.op}:${patch.path}`}>
        <span><strong>{patch.path}</strong><small>{patch.op === 'remove' ? 'Remove existing value' : boundedValue(patch.value)}</small></span>
        <Status tone={confidenceTone(patch.confidence)}>{confidenceLabel(patch.confidence)}</Status>
      </div>)}
    </div> : null}
    <details>
      <summary>Source and lineage</summary>
      <Provenance sources={source ? [source] : []} references={references.length ? references : [{fileId: document.fileId, sha256: document.sourceSha256}]}/>
    </details>
  </article>;
}

function ProposalReview({
  intake,
  canChange,
  busy,
  onAnalyze,
  onApprove,
  onApply,
}: {
  intake: IntelligenceIntake;
  canChange: boolean;
  busy: boolean;
  onAnalyze: () => void;
  onApprove: (reason: string) => void;
  onApply: () => void;
}) {
  const [reason, setReason] = useState('');
  const proposal = intake.proposal;
  const plan = proposal?.payload.plan;
  const review = proposal?.payload.review;
  const warnings = proposal ? proposalWarnings(proposal) : [];
  const violations = review?.violations || [];
  const blocked = !plan || !review || !review.valid || review.state === 'blocked' || review.approval === 'prohibited' || proposal?.payload.acceptedForReview !== true;
  const requiresMfa = !!proposal && proposalMutates(proposal);
  const cleanSourceCount = intake.sources.filter((source) => source.scanStatus === 'clean').length;
  const sourceChecksComplete = cleanSourceCount === intake.sources.length;

  return <section className="ops-card ops-intelligence-review" aria-label="Selected intake">
    <header className="ops-intelligence-review-heading">
      <div><p className="ops-eyebrow">Selected intake</p><h2>{intake.title}</h2><p>{intake.instructions || 'Classify and organise the verified sources.'}</p></div>
      <Status tone={presentationStatus(intake).tone}>{presentationStatus(intake).label}</Status>
    </header>
    <Progress status={intake.status}/>

    {intake.status === 'received' ? <div className="ops-intelligence-state" role="status">
      <h3>{sourceChecksComplete ? 'Preparing the proposal' : `Checking source ${cleanSourceCount + 1} of ${intake.sources.length}`}</h3>
      <p>The verified originals are preserved. Processing is resumable and no MineralX record has been changed.</p>
      <button type="button" disabled={!canChange || busy} onClick={onAnalyze}>{busy ? 'Processing…' : 'Resume processing'}</button>
    </div> : null}

    {proposal ? <>
      <section className="ops-intelligence-proposal-summary">
        <div><span>Proposal</span><strong>{actionLabels[proposal.action]}</strong></div>
        <div><span>Confidence</span><Status tone={confidenceTone(plan?.confidence)}>{confidenceLabel(plan?.confidence)}</Status></div>
        <div><span>Risk</span><strong>{humanize(review?.risk || 'not assessed')}</strong></div>
        <div><span>Approval</span><strong>{requiresMfa || review?.approval === 'human_mfa' ? 'Human + MFA' : humanize(review?.approval || 'not assessed')}</strong></div>
      </section>
      <p className="ops-intelligence-summary">{plan?.summary || proposal.summary}</p>
      {proposal.payload.commands?.length ? <div className="ops-intelligence-commands">
        <h3>Bounded actions</h3>
        {proposal.payload.commands.map((command) => <p className="ops-intelligence-command" key={`${command.action}:${command.id}`}><span>Controlled action</span><code>{command.action}</code><small>Target {command.id.slice(0, 8)}… · expected version {command.expected}</small></p>)}
      </div> : null}
      <WarningList warnings={warnings} violations={violations} sources={intake.sources}/>
      {plan?.documents.length ? <section className="ops-intelligence-documents" aria-labelledby="intelligence-proposal-heading">
        <h3 id="intelligence-proposal-heading">Proposed result</h3>
        {plan.documents.map((document) => <DocumentReviewCard key={document.fileId} document={document} source={intake.sources.find((source) => source.fileId === document.fileId)}/>)}
      </section> : null}
    </> : null}

    {intake.status === 'proposed' && proposal ? blocked ? <Message error>This proposal failed a source or policy check. It cannot be approved. Nothing has been applied.</Message> : <form className="ops-intelligence-decision" onSubmit={(event) => {event.preventDefault(); onApprove(reason.trim());}}>
      <label htmlFor={`intelligence-reason-${proposal.id}`}>Approval reason
        <input id={`intelligence-reason-${proposal.id}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} required placeholder="Checked destination, source evidence and proposed changes"/>
        <small>{requiresMfa || review?.approval === 'human_mfa' ? 'This change requires a verified session. ' : ''}Approval records your decision; it does not apply the change.</small>
      </label>
      <button className="ops-primary" type="submit" disabled={!canChange || busy || reason.trim().length < 3}>{busy ? 'Recording approval…' : 'Approve proposal'}</button>
    </form> : null}

    {intake.status === 'approved' && proposal && !blocked ? <section className="ops-intelligence-apply">
      <div><h3>Approved — application pending</h3><p>{proposal.approvalReason || 'The proposal has an accountable approval.'}{proposal.approvedAt ? ` · ${formatDate(proposal.approvedAt)}` : ''} Retries resume safely until every governed action receipt is recorded.</p></div>
      <button className="ops-primary" type="button" disabled={!canChange || busy} onClick={onApply}>{busy ? 'Applying…' : proposalMutates(proposal) ? 'Apply approved change' : 'Complete review'}</button>
    </section> : null}
    {intake.status === 'approved' && proposal && blocked ? <Message error>The approved proposal no longer has a valid policy review. It cannot be applied.</Message> : null}

    {intake.status === 'completed' && proposal ? <section className="ops-intelligence-complete" role="status">
      <h3>{proposalMutates(proposal) ? 'Change applied' : 'Review complete'}</h3>
      <p>{proposal.completion?.summary || 'MineralX recorded the completed result and its source lineage.'}</p>
      <small>Completed {formatDate(intake.completedAt)} · intake version {intake.version}{intake.executions?.length ? ` · ${intake.executions.length} governed action receipt${intake.executions.length === 1 ? '' : 's'}` : ''}</small>
    </section> : null}

    <details className="ops-intelligence-source-register">
      <summary>Verified originals ({intake.sources.length})</summary>
      <Provenance sources={intake.sources}/>
    </details>
  </section>;
}

export default function Intelligence() {
  const {scope, context, development, online, offlineMode} = useOperations();
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [family, setFamily] = useState('');
  const [instruction, setInstruction] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [overrides, setOverrides] = useState<Record<string, IntelligenceIntake>>({});
  const [busyAction, setBusyAction] = useState('');
  const [issue, setIssue] = useState('');
  const [listRows, setListRows] = useState<IntelligenceSummary[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const createIdentity = useRef<{signature: string; intakeId: string; requestId: string} | null>(null);
  const mutationIdentities = useRef<Record<string, {signature: string; requestId: string}>>({});
  const analysisRun = useRef(0);
  const listPath = scope && !development
    ? `intelligence?scope=${encodeURIComponent(scope.id)}&limit=50${listCursor ? `&cursor=${encodeURIComponent(listCursor)}` : ''}`
    : null;
  const {data: listPage, error: loadError, loading, reload: reloadList} = useResource<IntelligenceListPage>(listPath);
  useEntryGuard(queued.length > 0 || instruction.trim().length > 0, uploading || busyAction.length > 0);

  useEffect(() => {
    analysisRun.current += 1;
    setFamily('');
    setListRows([]);
    setListCursor(null);
    setNextCursor(null);
    setSelectedId('');
    setOverrides({});
  }, [scope?.id]);

  useEffect(() => {
    if (!listPage) return;
    setListRows((current) => {
      const records = new Map((listCursor ? current : []).map((intake) => [intake.id, intake]));
      for (const intake of listPage.rows) records.set(intake.id, intake);
      return [...records.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    });
    setNextCursor(listPage.next);
  }, [listPage, listCursor]);

  const allowedFamilies = useMemo(() => Object.keys(familyLabels).filter((candidate) => scope?.permissions.includes(`files.${candidate}`)), [scope?.permissions]);
  const activeFamily = allowedFamilies.length === 1
    ? allowedFamilies[0]
    : allowedFamilies.includes(family) ? family : '';
  const canWrite = !!scope?.permissions.includes('work.write');
  const canUseEvidence = development || context?.capabilities.evidence === true;
  const canChange = !development && canWrite && canUseEvidence && online && !offlineMode;
  const intakes = useMemo(() => {
    const records = new Map(listRows.map((intake) => [intake.id, intake]));
    for (const intake of Object.values(overrides)) {
      const summary = summarizeIntake(intake);
      const current = records.get(summary.id);
      if (!current || summary.version >= current.version) records.set(summary.id, summary);
    }
    return [...records.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [listRows, overrides]);
  const selectedSummary = intakes.find((intake) => intake.id === selectedId) || intakes[0];
  const effectiveSelectedId = selectedSummary?.id || '';
  const detailPath = scope && !development && effectiveSelectedId
    ? `intelligence?scope=${encodeURIComponent(scope.id)}&intake=${encodeURIComponent(effectiveSelectedId)}`
    : null;
  const {data: loadedDetail, error: detailError, loading: detailLoading} = useResource<IntelligenceIntake>(detailPath);
  const overriddenDetail = effectiveSelectedId ? overrides[effectiveSelectedId] : undefined;
  const selected = overriddenDetail && (!loadedDetail || overriddenDetail.version >= loadedDetail.version)
    ? overriddenDetail
    : loadedDetail;
  const verified = queued.filter((item) => item.phase === 'verified' && item.record);
  const ready = verified.length > 0 && queued.every((item) => item.phase === 'verified');

  const keepRecord = (response: IntakeMutationResponse) => {
    const record = mutationRecord(response);
    setOverrides((current) => ({...current, [record.id]: record}));
    setSelectedId(record.id);
    return record;
  };

  const refreshInbox = () => {
    if (listCursor) setListCursor(null);
    else reloadList();
  };

  const requestIdFor = (key: string, signature: string) => {
    const current = mutationIdentities.current[key];
    if (current?.signature === signature) return current.requestId;
    const next = {signature, requestId: crypto.randomUUID()};
    mutationIdentities.current[key] = next;
    return next.requestId;
  };

  const uploadQueuedFile = async (item: QueuedFile) => {
    if (!scope) return;
    if (isGenericZip(item.file)) {
      setQueued((current) => current.map((candidate) => candidate.key === item.key ? {...candidate, phase: 'failed', error: 'Generic ZIP archives are not accepted. Add the original supported files instead.', retryable: false} : candidate));
      return;
    }
    if (!item.file.size || item.file.size > OPS_FILE_MAX_BYTES) {
      setQueued((current) => current.map((candidate) => candidate.key === item.key ? {...candidate, phase: 'failed', error: 'Choose a non-empty file up to 50 MiB.', retryable: false} : candidate));
      return;
    }
    setQueued((current) => current.map((candidate) => candidate.key === item.key ? {...candidate, phase: 'uploading', error: undefined, retryable: undefined} : candidate));
    try {
      const raw: unknown = await uploadEvidence(scope.id, item.family, item.file, {id: item.id, requestId: item.requestId});
      const record = verifiedEvidence(raw);
      if (record.id !== item.id || record.name !== item.file.name || record.family !== item.family || record.size_bytes !== item.file.size) throw new Error('The verified file record does not match this intake. Keep the original and retry.');
      setQueued((current) => current.map((candidate) => candidate.key === item.key ? {...candidate, phase: 'verified', record, error: undefined, retryable: undefined} : candidate));
    } catch (caught) {
      setQueued((current) => current.map((candidate) => candidate.key === item.key ? {...candidate, phase: 'failed', error: (caught as Error).message, retryable: true} : candidate));
    }
  };

  const addFiles = async (files: File[]) => {
    if (!scope || !activeFamily || uploading) return;
    setIssue('');
    const existing = new Set(queued.map((item) => item.fingerprint));
    const available = MAX_FILES - queued.length;
    const additions: QueuedFile[] = [];
    let totalBytes = queued.reduce((sum, item) => sum + item.file.size, 0);
    let exceededBatchLimit = false;
    for (const file of files) {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(fingerprint) || additions.some((item) => item.fingerprint === fingerprint)) continue;
      if (additions.length >= available) break;
      if (totalBytes + file.size > OPS_INTAKE_MAX_BYTES) { exceededBatchLimit = true; continue; }
      additions.push({
        key: `${fingerprint}:${crypto.randomUUID()}`,
        fingerprint,
        file,
        family: activeFamily,
        id: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        phase: 'queued',
      });
      totalBytes += file.size;
    }
    if (!additions.length) {
      setIssue(exceededBatchLimit ? 'An intake can contain up to 100 MiB in total. Split larger dumps into separate intakes.' : available ? 'Those files are already in this intake.' : `An intake can contain up to ${MAX_FILES} files.`);
      return;
    }
    if (exceededBatchLimit) setIssue('An intake can contain up to 100 MiB in total. Split larger dumps into separate intakes.');
    else if (files.length > additions.length && additions.length === available) setIssue(`Only the first ${available} additional files were added. An intake can contain up to ${MAX_FILES}.`);
    setQueued((current) => [...current, ...additions]);
    setUploading(true);
    try {
      for (const item of additions) await uploadQueuedFile(item);
    } finally {
      setUploading(false);
    }
  };

  const retryUpload = async (item: QueuedFile) => {
    setIssue('');
    setUploading(true);
    try { await uploadQueuedFile(item); }
    finally { setUploading(false); }
  };

  const createIntake = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scope || !ready) return;
    const records = verified.flatMap((item) => item.record ? [item.record] : []);
    const signature = `${scope.id}:${records.map((record) => record.id).join(',')}:${instruction.trim()}`;
    if (createIdentity.current?.signature !== signature) createIdentity.current = {signature, intakeId: crypto.randomUUID(), requestId: crypto.randomUUID()};
    const identity = createIdentity.current;
    const title = records.length === 1 ? `Source · ${records[0].name}` : `${records.length} sources · ${records[0].name}`;
    const request: CreateIntakeRequest = {
      action: 'create',
      scopeId: scope.id,
      intakeId: identity.intakeId,
      requestId: identity.requestId,
      title: title.slice(0, 240),
      instructions: instruction.trim(),
      sources: records.map((record) => ({fileId: record.id})),
    };
    setIssue('');
    setBusyAction('create');
    let created: IntelligenceIntake | null = null;
    try {
      created = keepRecord(await api<IntakeMutationResponse>('intelligence', request));
      setQueued([]);
      setFamily('');
      setInstruction('');
      createIdentity.current = null;
    } catch (caught) {
      setIssue((caught as Error).message);
    } finally {
      setBusyAction('');
    }
    if (created) await analyzeIntake(created);
  };

  const analyzeIntake = async (intake: IntelligenceIntake) => {
    const run = ++analysisRun.current;
    let current = intake;
    setIssue('');
    setBusyAction(`analyze:${intake.id}`);
    try {
      const maximumPhases = current.sources.filter((source) => source.scanStatus === 'pending').length + 1;
      for (let phase = 0; phase < maximumPhases && current.status === 'received'; phase += 1) {
        const pendingBefore = current.sources.filter((source) => source.scanStatus === 'pending').length;
        const request: AnalyzeIntakeRequest = {action: 'analyze', scopeId: current.scopeId, intakeId: current.id};
        const response = await api<IntakeMutationResponse>('intelligence', request, {timeoutMs: 115_000});
        if (analysisRun.current !== run) return;
        const next = keepRecord(response);
        if (next.status === 'received') {
          const pendingAfter = next.sources.filter((source) => source.scanStatus === 'pending').length;
          if (pendingBefore === 0 || pendingAfter >= pendingBefore) {
            throw new Error('Processing did not advance. The retained intake is safe; resume it from the inbox.');
          }
        }
        current = next;
      }
      if (current.status === 'received') {
        throw new Error('Processing paused before a proposal was ready. The retained intake is safe; resume it from the inbox.');
      }
      refreshInbox();
    } catch (caught) {
      if (analysisRun.current === run) setIssue((caught as Error).message);
    } finally {
      if (analysisRun.current === run) setBusyAction('');
    }
  };

  const approveIntake = async (intake: IntelligenceIntake, reason: string) => {
    const proposal = intake.proposal;
    if (!proposal || reason.length < 3) return;
    const signature = `${intake.id}:${proposal.id}:${proposal.version}:${reason}`;
    const key = `approve:${proposal.id}`;
    const request: ApproveIntakeRequest = {
      action: 'approve',
      scopeId: intake.scopeId,
      intakeId: intake.id,
      proposalId: proposal.id,
      expectedVersion: proposal.version,
      requestId: requestIdFor(key, signature),
      reason,
    };
    setIssue('');
    setBusyAction(key);
    try {
      keepRecord(await api<IntakeMutationResponse>('intelligence', request));
      delete mutationIdentities.current[key];
      refreshInbox();
    } catch (caught) { setIssue((caught as Error).message); }
    finally { setBusyAction(''); }
  };

  const applyIntake = async (intake: IntelligenceIntake) => {
    const proposal = intake.proposal;
    if (!proposal) return;
    const signature = `${intake.id}:${proposal.id}:${proposal.version}`;
    const key = `apply:${proposal.id}`;
    const request: ApplyIntakeRequest = {
      action: 'apply',
      scopeId: intake.scopeId,
      intakeId: intake.id,
      proposalId: proposal.id,
      expectedVersion: proposal.version,
      requestId: requestIdFor(key, signature),
    };
    setIssue('');
    setBusyAction(key);
    try {
      keepRecord(await api<IntakeMutationResponse>('intelligence', request));
      delete mutationIdentities.current[key];
      refreshInbox();
    } catch (caught) { setIssue((caught as Error).message); }
    finally { setBusyAction(''); }
  };

  if (development) return <>
    <Heading title="Intelligence inbox" description="Verified shared records are required before MineralX can prepare accountable proposals."/>
    <Message>The Intelligence inbox is available in Shared Operations after staff sign-in. Development records remain browser-local and are not sent for analysis.</Message>
  </>;

  return <>
    <Heading title="Intelligence inbox" description="Add source files. MineralX preserves the originals, prepares a source-linked proposal and waits for an accountable approval before changing records." action={<button type="button" onClick={refreshInbox} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh inbox'}</button>}/>
    {!online || offlineMode ? <Message error>Reconnect before uploading, approving or applying intelligence work. Nothing will be queued as an authorised change.</Message> : null}
    {!canWrite ? <Message>You can inspect intelligence work in this workspace, but creating or approving it requires work access.</Message> : null}
    {loadError ? <Message error>{loadError}</Message> : null}
    {issue ? <Message error>{issue}<button type="button" onClick={() => setIssue('')}>Dismiss</button></Message> : null}

    {canWrite ? <form className="ops-card ops-intelligence-compose" onSubmit={createIntake}>
      <div className="ops-section-heading"><div><h2>Add source files</h2><p>Up to {MAX_FILES} verified originals per intake, 50 MiB each and 100 MiB in total.</p></div>{queued.length ? <button type="button" disabled={uploading || !!busyAction} onClick={() => {setQueued([]); setIssue(''); createIdentity.current = null;}}>Clear</button> : null}</div>
      {allowedFamilies.length > 1 ? <label className="ops-intelligence-family">Store originals with
        <select value={activeFamily} onChange={(event) => {setFamily(event.target.value); createIdentity.current = null;}} disabled={queued.length > 0 || uploading} required>
          <option value="" disabled>Select a source area</option>
          {allowedFamilies.map((candidate) => <option value={candidate} key={candidate}>{familyLabels[candidate]}</option>)}
        </select>
      </label> : null}
      <div className={`ops-intelligence-dropzone ${dragging ? 'is-dragging' : ''} ${!canChange || !activeFamily ? 'is-disabled' : ''}`}
        aria-disabled={!canChange || !activeFamily}
        onDragEnter={(event) => {event.preventDefault(); if (canChange && activeFamily) setDragging(true);}}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);}}
        onDrop={(event) => {event.preventDefault(); setDragging(false); if (canChange && activeFamily) void addFiles(Array.from(event.dataTransfer.files));}}>
        <div><strong>Drop operational files here</strong><span>Assays, logs, reports, spreadsheets, spatial files or images</span></div>
        <label className="ops-file-button">{uploading ? 'Verifying files…' : 'Choose files'}
          <input type="file" multiple accept={ACCEPTED_FILES} disabled={!canChange || uploading || !activeFamily} onChange={(event) => {const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles(files);}}/>
        </label>
      </div>
      {!canUseEvidence ? <p className="ops-muted">Private file storage is awaiting activation. No files can be submitted.</p> : null}
      {!allowedFamilies.length ? <p className="ops-muted">This account does not have access to a source-file family in the selected workspace.</p> : null}
      {allowedFamilies.length > 1 && !activeFamily ? <p className="ops-muted">Select the source area that owns these originals before adding files.</p> : null}
      {queued.length ? <ul className="ops-intelligence-upload-list" aria-label="Files for this intake">
        {queued.map((item) => <li key={item.key}>
          <div><strong>{item.file.name}</strong><small>{familyLabels[item.family] || item.family} · {formatBytes(item.file.size)}{item.record ? ` · SHA-256 ${item.record.sha256.slice(0, 12)}…` : ''}</small>{item.error ? <span>{item.error}</span> : null}</div>
          <Status tone={item.phase === 'failed' ? 'error' : item.phase === 'uploading' || item.phase === 'queued' ? 'warning' : 'neutral'}>{item.phase === 'verified' ? 'Verified' : item.phase === 'failed' ? 'Needs attention' : item.phase === 'uploading' ? 'Verifying' : 'Queued'}</Status>
          {item.phase === 'failed' && item.retryable ? <button type="button" disabled={uploading} onClick={() => void retryUpload(item)}>Retry</button> : null}
          {item.phase !== 'uploading' ? <button className="ops-link" type="button" disabled={uploading} onClick={() => setQueued((current) => current.filter((candidate) => candidate.key !== item.key))}>Remove</button> : null}
        </li>)}
      </ul> : null}
      {queued.length ? <p className="ops-muted">Removing a file from this intake does not delete its verified original from Files &amp; procedures.</p> : null}
      <label htmlFor="intelligence-instruction">Instruction <small>Optional. If blank, MineralX classifies and organises the sources.</small>
        <textarea id="intelligence-instruction" rows={2} maxLength={4000} value={instruction} onChange={(event) => {setInstruction(event.target.value); createIdentity.current = null;}} placeholder="For example: organise these assay certificates and prepare the appropriate draft records."/>
      </label>
      <footer className="ops-intelligence-compose-footer"><small>The intake is retained first, then processed in resumable steps. Nothing is approved or applied automatically.</small><button className="ops-primary" type="submit" disabled={!canChange || !ready || !!busyAction}>{busyAction === 'create' ? 'Retaining intake…' : 'Prepare for review'}</button></footer>
    </form> : null}

    <section className="ops-intelligence-workspace">
      <section className="ops-card ops-intelligence-inbox" aria-labelledby="intelligence-inbox-heading">
        <div className="ops-section-heading"><div><h2 id="intelligence-inbox-heading">Inbox</h2><p>{intakes.length} intake{intakes.length === 1 ? '' : 's'}</p></div></div>
        {loading && !intakes.length ? <p role="status">Loading intelligence work…</p> : !intakes.length ? <Empty title="No intelligence work yet">Add verified originals above. Each proposal will remain here with its approval and source history.</Empty> : <>
          <ul>{intakes.map((intake) => {const state = summaryStatus(intake); return <li key={intake.id}>
            <button type="button" aria-current={effectiveSelectedId === intake.id ? 'true' : undefined} onClick={() => setSelectedId(intake.id)}>
              <span><strong>{intake.title}</strong><small>{intake.sourceCount} source{intake.sourceCount === 1 ? '' : 's'} · {formatDate(intake.createdAt)}</small></span>
              <Status tone={state.tone}>{state.label}</Status>
            </button>
          </li>;})}</ul>
          {nextCursor ? <button type="button" disabled={loading} onClick={() => setListCursor(nextCursor)}>{loading ? 'Loading…' : 'Load more'}</button> : null}
        </>}
      </section>
      {detailError && !selected ? <section className="ops-card"><Message error>{detailError}</Message></section> : detailLoading && !selected ? <section className="ops-card"><p role="status">Loading intake details…</p></section> : selected ? <ProposalReview key={selected.proposal?.id || selected.id} intake={selected} canChange={canChange} busy={!!busyAction} onAnalyze={() => void analyzeIntake(selected)} onApprove={(reason) => void approveIntake(selected, reason)} onApply={() => void applyIntake(selected)}/> : null}
    </section>
  </>;
}

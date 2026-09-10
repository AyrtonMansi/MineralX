import 'server-only';

import {createHash} from 'node:crypto';
import {z} from 'zod';
import {classifyDatabaseError, OPS_INTAKE_MAX_BYTES, OpsError, type Scope} from '@/lib/ops/contracts';
import {EVIDENCE_BUCKET, trustedDatabase, verifiedSource, type OperationsRpcClient} from '@/lib/ops/server';
import {scanEvidenceBytes} from './file-scanning';
import {
  createIntelligenceEngine,
  deterministicFallbackPlan,
  intelligencePlanSchema,
  intakeInstructionSchema,
  requirePersistablePlanningResult,
  reviewIntelligencePlan,
  sourceReferenceSchema,
  type FileReference,
  type IntelligencePlan,
  type IntelligencePlanningResult,
  type IntakeInstruction,
} from './index';
import {MINERALX_INTELLIGENCE_ACTIONS, documentCategories, documentStorageCategory} from './catalog';
import {createOpenAiPlanner, externalPlannerEnabled} from './openai-planner';
import {partitionOpenAiInputFiles} from './provider-contract';

type DatabaseClient = OperationsRpcClient;
type Runtime = {db: DatabaseClient; actorId: string; scope: Scope};

const sourceInputSchema = z.object({
  fileId: z.string().uuid(),
  sourceReference: sourceReferenceSchema.optional(),
}).strict();

const verifiedFileRecordSchema = z.object({
  id: z.string().uuid(),
  family: z.enum(['geo', 'plant', 'gold', 'custody']),
  name: z.string().min(1).max(240),
  media_type: z.string().min(3).max(160),
  size_bytes: z.coerce.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal('verified'),
  scan_status: z.enum(['pending', 'clean']),
}).passthrough();

export const createIntakeSchema = z.object({
  scopeId: z.string().uuid(),
  intakeId: z.string().uuid(),
  requestId: z.string().uuid(),
  title: z.string().trim().min(3).max(240),
  instructions: z.string().trim().max(4000).default('Organize these sources in MineralX.'),
  sources: z.array(sourceInputSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.sources.forEach((source, index) => {
    if (ids.has(source.fileId)) context.addIssue({code: 'custom', path: ['sources', index, 'fileId'], message: 'Attach each source once.'});
    ids.add(source.fileId);
  });
});

export const analyzeIntakeSchema = z.object({scopeId: z.string().uuid(), intakeId: z.string().uuid()}).strict();
export const approveIntakeSchema = z.object({
  scopeId: z.string().uuid(), intakeId: z.string().uuid(), proposalId: z.string().uuid(),
  expectedVersion: z.number().int().positive(), requestId: z.string().uuid(), reason: z.string().trim().min(3).max(1000),
}).strict();
export const applyIntakeSchema = z.object({
  scopeId: z.string().uuid(), intakeId: z.string().uuid(), proposalId: z.string().uuid(),
  expectedVersion: z.number().int().positive(), requestId: z.string().uuid(),
}).strict();

const sourceRecordSchema = z.object({
  fileId: z.string().uuid(), family: z.enum(['geo', 'plant', 'gold', 'custody']),
  name: z.string().min(1).max(240), mediaType: z.string().min(3).max(160),
  sizeBytes: z.coerce.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.string(), ordinal: z.coerce.number().int().positive(),
  scanStatus: z.enum(['pending', 'clean']), scanEngine: z.string().max(160), scannedAt: z.string().nullable(),
  sourceReference: z.string().max(500).default(''), attachedBy: z.string().uuid(), attachedAt: z.string(),
}).passthrough();

const proposalRecordSchema = z.object({
  id: z.string().uuid(), version: z.number().int().positive(), action: z.string(), summary: z.string(),
  payload: z.unknown(), status: z.enum(['proposed', 'approved', 'completed']),
  proposed_at: z.string(), approved_by: z.string().uuid().nullable().optional(), approved_at: z.string().nullable().optional(),
  approval_reason: z.string().default(''), completion: z.unknown().nullable().optional(), completed_at: z.string().nullable().optional(),
}).passthrough();

const executionRecordSchema = z.object({
  ordinal: z.number().int().positive(), requestId: z.string().uuid(),
  command: z.record(z.string(), z.unknown()), receipt: z.record(z.string(), z.unknown()),
  actorId: z.string().uuid(), executedAt: z.string(), scopeRevision: z.coerce.number().int().positive(), recordedAt: z.string(),
}).strict();

const rawIntakeSchema = z.object({
  id: z.string().uuid(), scope_id: z.string().uuid(), version: z.number().int().positive(),
  status: z.enum(['received', 'proposed', 'approved', 'completed']), title: z.string(), instructions: z.string(),
  created_by: z.string().uuid(), created_at: z.string(), proposed_at: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(), completed_at: z.string().nullable().optional(),
  sources: z.array(sourceRecordSchema).default([]), proposal: proposalRecordSchema.nullable().optional(),
  events: z.array(z.record(z.string(), z.unknown())).default([]), executions: z.array(executionRecordSchema).default([]),
}).passthrough();

const intelligenceSummarySchema = z.object({
  id: z.string().uuid(),
  scopeId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(['received', 'proposed', 'approved', 'completed']),
  title: z.string(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  proposedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  sourceCount: z.coerce.number().int().positive(),
  proposal: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    action: z.enum(['classify', 'summarize', 'route_file', 'create_draft', 'update_record', 'link_duplicate', 'create_task']),
    summary: z.string(),
    status: z.enum(['proposed', 'approved', 'completed']),
    acceptedForReview: z.boolean().nullable(),
    reviewState: z.enum(['informational', 'review_required', 'blocked']).nullable(),
  }).strict().nullable(),
}).strict();

const intelligenceListSchema = z.object({
  rows: z.array(intelligenceSummarySchema).max(100),
  next: z.string().uuid().nullable(),
}).strict();

export type MineralXIntelligenceRecord = ReturnType<typeof normalizeIntake>;
export type MineralXIntelligenceSummary = z.infer<typeof intelligenceSummarySchema>;
export type MineralXIntelligenceList = z.infer<typeof intelligenceListSchema>;

export function intelligenceStableUuid(namespace: string, value: string) {
  const bytes = createHash('sha256').update(namespace).update('\0').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function callRpc(db: DatabaseClient, name: string, args: Record<string, unknown>) {
  const {data, error} = await db.rpc(name, args);
  if (error) throw classifyDatabaseError(error);
  return data;
}

function normalizeEvent(event: Record<string, unknown>) {
  return {
    sequence: event.seq, type: event.event_type, principal: event.principal, actorId: event.actor_id,
    requestId: event.request_id, fromStatus: event.from_status, toStatus: event.to_status,
    version: event.version, reason: event.reason, recordedAt: event.recorded_at,
  };
}

export function normalizeIntake(input: unknown) {
  const value = rawIntakeSchema.parse(input);
  const proposal = value.proposal ? {
    id: value.proposal.id,
    version: value.proposal.version,
    action: value.proposal.action,
    summary: value.proposal.summary,
    payload: value.proposal.payload,
    status: value.proposal.status,
    proposedAt: value.proposal.proposed_at,
    approvedBy: value.proposal.approved_by || null,
    approvedAt: value.proposal.approved_at || null,
    approvalReason: value.proposal.approval_reason,
    completion: value.proposal.completion || null,
    completedAt: value.proposal.completed_at || null,
  } : null;
  return {
    id: value.id,
    scopeId: value.scope_id,
    version: value.version,
    status: value.status,
    title: value.title,
    instructions: value.instructions,
    createdBy: value.created_by,
    createdAt: value.created_at,
    proposedAt: value.proposed_at || null,
    approvedAt: value.approved_at || null,
    completedAt: value.completed_at || null,
    sources: value.sources,
    proposal,
    events: value.events.map(normalizeEvent),
    executions: value.executions,
  };
}

async function rawIntake(db: DatabaseClient, scopeId: string, intakeId: string) {
  const data = await callRpc(db, 'mx_ops_intelligence_read', {p_scope: scopeId, p_intake: intakeId});
  if (!data) throw new OpsError('not_found', 'This intelligence intake is not available in your workspace.');
  return rawIntakeSchema.parse(data);
}

export async function readIntelligence(db: DatabaseClient, scopeId: string, intakeId: string) {
  return normalizeIntake(await rawIntake(db, scopeId, intakeId));
}

export async function listIntelligence(
  db: DatabaseClient,
  scopeId: string,
  options: {cursor?: string; limit?: number} = {},
): Promise<MineralXIntelligenceList> {
  const cursor = options.cursor ? z.string().uuid().parse(options.cursor) : null;
  const limit = z.number().int().min(1).max(100).default(50).parse(options.limit);
  const data = await callRpc(db, 'mx_ops_intelligence_list', {
    p_scope: z.string().uuid().parse(scopeId),
    p_after: cursor,
    p_limit: limit,
  });
  return intelligenceListSchema.parse(data);
}

function instructionFor(value: z.infer<typeof rawIntakeSchema>): IntakeInstruction {
  const files: FileReference[] = value.sources.map((source) => ({
    id: source.fileId,
    scopeId: value.scope_id,
    version: 1,
    name: source.name,
    mediaType: source.mediaType,
    sizeBytes: source.sizeBytes,
    sha256: source.sha256,
    trust: source.status === 'verified' && source.scanStatus === 'clean' ? 'verified' : 'quarantined',
  }));
  return intakeInstructionSchema.parse({
    id: value.id,
    scopeId: value.scope_id,
    files,
    outcome: 'organize',
    instruction: value.instructions || undefined,
    preserveOriginal: true,
  });
}

function allowsExternalProcessing(scope: Scope) {
  const approvedScopeIds = (process.env.MINERALX_AI_SCOPE_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
  return externalPlannerEnabled() && (scope.policy?.ai_external_processing === true || approvedScopeIds.includes(scope.id));
}

function assertRuntimeScope(runtime:Runtime,scopeId:string){
  if(scopeId!==runtime.scope.id)throw new OpsError('forbidden','The selected intelligence workspace changed.');
}

async function mapWithConcurrency<T,R>(values:readonly T[],limit:number,task:(value:T,index:number)=>Promise<R>){
  const results=new Array<R>(values.length);
  let next=0;
  await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{
    for(;;){
      const index=next++;
      if(index>=values.length)return;
      results[index]=await task(values[index],index);
    }
  }));
  return results;
}

async function signedSources(runtime: Runtime, instruction: IntakeInstruction) {
  if (!allowsExternalProcessing(runtime.scope)) return null;
  const partition=partitionOpenAiInputFiles(instruction.files);
  const sources=await mapWithConcurrency(partition.batches.flat(),4,async(file)=>{
    const rows = await callRpc(runtime.db, 'mx_ops_files', {p_scope: runtime.scope.id, p_id: file.id});
    const record = Array.isArray(rows) ? rows[0] : null;
    if (!record?.object_path || record.status !== 'verified' || record.scan_status !== 'clean'
      || record.sha256 !== file.sha256 || record.name !== file.name || record.media_type !== file.mediaType
      || Number(record.size_bytes) !== file.sizeBytes) {
      throw new OpsError('validation', 'A source changed before intelligence processing. Review the stored original.');
    }
    const {data, error} = await trustedDatabase().storage.from(EVIDENCE_BUCKET).createSignedUrl(record.object_path, 300);
    if (error || !data?.signedUrl) throw new OpsError('unavailable', 'A source could not be authorised for the configured intelligence provider.');
    return {file,url:data.signedUrl};
  });
  return {sources,excluded:partition.excluded};
}

function providerBoundaryFallback(instruction:IntakeInstruction,excluded:ReadonlyMap<string,string>):IntelligencePlanningResult{
  const base=deterministicFallbackPlan(instruction);
  const documents=base.documents.map(document=>{
    const reason=excluded.get(document.fileId);
    const message=reason==='file_too_large'
      ?'The original is 50 MB or larger, so it was preserved without being sent to the provider and no filing action was created.'
      :'The provider cannot inspect this source format. The original was preserved and no filing action was created.';
    return {...document,classification:{
      ...document.classification,
      warnings:[...document.classification.warnings,{
        code:reason==='file_too_large'?'manual_review_required' as const:'unsupported_format' as const,
        severity:'warning' as const,message,blocksAutomation:true,
        provenance:[{fileId:document.fileId,sha256:document.sourceSha256}],
      }],
    }};
  });
  const plan={...base,documents,summary:'Unsupported or oversized originals were retained for manual routing. No filing actions were proposed.'};
  const review=reviewIntelligencePlan(instruction,plan,MINERALX_INTELLIGENCE_ACTIONS);
  return {source:'deterministic_fallback' as const,acceptedForReview:false,plan,review};
}

async function inspectSources(runtime: Runtime, sources: z.infer<typeof sourceInputSchema>[]) {
  const inspected=await mapWithConcurrency(sources,6,async(source)=>{
    const rows = await callRpc(runtime.db, 'mx_ops_files', {p_scope: runtime.scope.id, p_id: source.fileId});
    const candidate = Array.isArray(rows) ? rows[0] : null;
    const parsed = verifiedFileRecordSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.id !== source.fileId) {
      throw new OpsError('validation', 'Only integrity-verified source files may enter intelligence processing.');
    }
    if (!runtime.scope.permissions.includes(`files.${parsed.data.family}`)) {
      throw new OpsError('forbidden', 'A source file family is not assigned to this account.');
    }
    return {source,record:parsed.data,size:parsed.data.size_bytes};
  });
  const totalBytes=inspected.reduce((total,item)=>total+item.size,0);
  if(totalBytes>OPS_INTAKE_MAX_BYTES)throw new OpsError('validation','A single intake is limited to 100 MiB. Split larger dumps into separate intakes.');
  return inspected;
}

async function scanSource(runtime: Runtime, source: z.infer<typeof sourceRecordSchema>) {
  const verified = await verifiedSource(runtime.db, runtime.scope.id, source.fileId, source.family);
  if (verified.file.name !== source.name
    || verified.file.media_type !== source.mediaType
    || Number(verified.file.size_bytes) !== source.sizeBytes
    || verified.file.sha256 !== source.sha256) {
    throw new OpsError('validation', 'A source changed before its safety scan. Review the stored original.');
  }
  if (verified.file.scan_status === 'clean') return;
  const scan = await scanEvidenceBytes(verified.bytes, {
    name: verified.file.name, mediaType: verified.file.media_type, sha256: verified.file.sha256,
  });
  const {error} = await trustedDatabase().rpc('mx_ops_file_scan_attest', {
    p_actor: runtime.actorId,
    p_scope: runtime.scope.id,
    p_id: source.fileId,
    p_hash: verified.file.sha256,
    p_engine: scan.engine,
  });
  if (error) throw classifyDatabaseError(error);
}

function patchText(plan: IntelligencePlan, fileId: string, path: '/title' | '/category') {
  const patch = plan.documents.find((document) => document.fileId === fileId)?.patches.find((item) => item.op === 'set' && item.path === path);
  const value = patch?.op === 'set' && typeof patch.value === 'string' ? patch.value.trim() : '';
  return /[\u0000-\u001f\u007f]/.test(value) ? '' : value;
}

function fallbackTitle(name: string) {
  const title = name.replace(/\.[a-z0-9]{1,10}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (title.length >= 3 ? title : `Source — ${name}`).slice(0, 240);
}

function commandsFor(plan: IntelligencePlan, instruction: IntakeInstruction) {
  const byId = new Map(instruction.files.map((file) => [file.id, file]));
  return plan.documents.flatMap((document) => {
    if (!document.mapping || document.mapping.target.action !== 'document.publish' || document.mapping.target.operation !== 'create') return [];
    const file = byId.get(document.fileId);
    if (!file) return [];
    const proposedTitle = patchText(plan, file.id, '/title');
    const proposedCategory = patchText(plan, file.id, '/category');
    const title = (proposedTitle.length >= 3 ? proposedTitle : fallbackTitle(file.name)).slice(0, 240);
    const category = (documentCategories as readonly string[]).includes(proposedCategory)
      ? proposedCategory
      : documentStorageCategory(document.classification.kind);
    return [{
      action: 'document.publish',
      id: intelligenceStableUuid('mineralx-intelligence-document', `${instruction.id}:${file.id}`),
      expected: 0,
      payload: {title, category, file_id: file.id},
    }];
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function verifiedProposal(value: z.infer<typeof rawIntakeSchema>) {
  if (!value.proposal) throw new OpsError('validation', 'This intake does not have a proposal to review.');
  const payload = z.object({
    contractVersion: z.literal(1),
    plan: intelligencePlanSchema,
    commands: z.array(z.object({
      action: z.string(), id: z.string().uuid(), expected: z.number().int().nonnegative(), payload: z.record(z.string(), z.unknown()),
    }).strict()).max(32).default([]),
  }).passthrough().parse(value.proposal.payload);
  const instruction = instructionFor(value);
  const review = reviewIntelligencePlan(instruction, payload.plan, MINERALX_INTELLIGENCE_ACTIONS);
  const expectedCommands = review.state === 'blocked' ? [] : commandsFor(payload.plan, instruction);
  if (canonical(payload.commands) !== canonical(expectedCommands)) {
    throw new OpsError('validation', 'The stored actions no longer match the current MineralX intelligence policy. Recreate the intake.');
  }
  return {proposal: value.proposal, payload, instruction, review};
}

export async function analyzeIntake(runtime: Runtime, input: z.infer<typeof analyzeIntakeSchema>) {
  assertRuntimeScope(runtime,input.scopeId);
  const value = await rawIntake(runtime.db, input.scopeId, input.intakeId);
  if (value.created_by !== runtime.actorId) throw new OpsError('forbidden', 'Only the intake owner can start its intelligence processing.');
  if (value.status !== 'received') return normalizeIntake(value);
  if (value.sources.some((source) => source.status !== 'verified')) {
    throw new OpsError('validation', 'Every attached source must remain integrity-verified during intelligence processing.');
  }
  const totalBytes = value.sources.reduce((total, source) => total + source.sizeBytes, 0);
  if (totalBytes > OPS_INTAKE_MAX_BYTES) {
    throw new OpsError('validation', 'A single intake is limited to 100 MiB. Split larger dumps into separate intakes.');
  }
  const pending = value.sources
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .find((source) => source.scanStatus === 'pending');
  if (pending) {
    await scanSource(runtime, pending);
    return normalizeIntake(await rawIntake(runtime.db, input.scopeId, input.intakeId));
  }
  const instruction = instructionFor(value);
  const providerSources = await signedSources(runtime, instruction);
  const planner = providerSources?.sources.length
    ?createOpenAiPlanner({actorId: runtime.actorId,sources:providerSources.sources}):undefined;
  const planned = providerSources&&!providerSources.sources.length
    ?providerBoundaryFallback(instruction,providerSources.excluded)
    :await createIntelligenceEngine({catalog: MINERALX_INTELLIGENCE_ACTIONS, planner}).plan(instruction);
  requirePersistablePlanningResult(planned);
  const commands = planned.review.state === 'blocked' ? [] : commandsFor(planned.plan, instruction);
  const proposalAction = commands.length ? 'route_file' : 'classify';
  const payload = {
    contractVersion: 1,
    source: planned.source,
    acceptedForReview: planned.acceptedForReview,
    failure: planned.failure || null,
    plan: planned.plan,
    review: planned.review,
    ...(commands.length ? {commands} : {}),
  };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 145_000) throw new OpsError('validation', 'The proposed filing set is too large. Split this dump into smaller intakes.');
  const current=await rawIntake(runtime.db,input.scopeId,input.intakeId);
  if(current.status!=='received')return normalizeIntake(current);
  const service = trustedDatabase();
  const response = await callRpc(service, 'mx_ops_intelligence_propose', {
    p_scope: input.scopeId,
    p_request: intelligenceStableUuid('mineralx-intelligence-propose-request', input.intakeId),
    p_intake: input.intakeId,
    p_proposal: intelligenceStableUuid('mineralx-intelligence-proposal', input.intakeId),
    p_expected: value.version,
    p_action: proposalAction,
    p_summary: planned.plan.summary,
    p_payload: payload,
  });
  return normalizeIntake(response.record);
}

export async function createIntake(runtime: Runtime, input: z.infer<typeof createIntakeSchema>) {
  const parsed = createIntakeSchema.parse(input);
  assertRuntimeScope(runtime,parsed.scopeId);
  const inspected = await inspectSources(runtime, parsed.sources);
  const sourceFamilies = new Set(inspected.map(({record}) => record.family));
  if (sourceFamilies.size !== 1) {
    throw new OpsError('validation', 'Each intelligence intake must use one source family. Split mixed sources into separate intakes.');
  }
  const response = await callRpc(runtime.db, 'mx_ops_intelligence_create', {
    p_scope: parsed.scopeId,
    p_request: parsed.requestId,
    p_intake: parsed.intakeId,
    p_title: parsed.title,
    p_instructions: parsed.instructions,
    p_sources: parsed.sources,
  });
  if (!response?.record) throw new OpsError('unavailable', 'MineralX did not confirm the retained intelligence intake.');
  return normalizeIntake(response.record);
}

export async function approveIntake(runtime: Runtime, input: z.infer<typeof approveIntakeSchema>) {
  const parsed = approveIntakeSchema.parse(input);
  assertRuntimeScope(runtime,parsed.scopeId);
  const value = await rawIntake(runtime.db, parsed.scopeId, parsed.intakeId);
  const checked = verifiedProposal(value);
  if (checked.proposal.id !== parsed.proposalId) throw new OpsError('conflict', 'The proposal changed before approval.');
  if (checked.review.state === 'blocked' || checked.review.approval === 'prohibited') {
    throw new OpsError('validation', 'Resolve the proposal warnings before approval. No MineralX records were changed.');
  }
  const response = await callRpc(runtime.db, 'mx_ops_intelligence_approve', {
    p_scope: parsed.scopeId, p_request: parsed.requestId, p_intake: parsed.intakeId,
    p_proposal: parsed.proposalId, p_expected: parsed.expectedVersion, p_reason: parsed.reason,
  });
  return normalizeIntake(response.record);
}

export async function applyIntake(runtime: Runtime, input: z.infer<typeof applyIntakeSchema>) {
  const parsed = applyIntakeSchema.parse(input);
  assertRuntimeScope(runtime,parsed.scopeId);
  const value = await rawIntake(runtime.db, parsed.scopeId, parsed.intakeId);
  const checked = verifiedProposal(value);
  if(checked.proposal.id!==parsed.proposalId)throw new OpsError('conflict','The proposal changed before it could be applied.');
  if (value.status === 'completed') return normalizeIntake(value);
  if (checked.proposal.version !== parsed.expectedVersion) {
    throw new OpsError('conflict', 'The proposal changed before it could be applied.');
  }
  if (checked.proposal.status !== 'approved') {
    throw new OpsError('validation', 'Approve the current proposal before applying it.');
  }
  if (checked.proposal.approved_by !== runtime.actorId) {
    throw new OpsError('forbidden', 'The account that approved this proposal must apply it.');
  }
  if (checked.review.state === 'blocked') throw new OpsError('validation', 'The current policy blocks this proposal. No MineralX records were changed.');
  const executionRequestIds: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  for (const [index, command] of checked.payload.commands.entries()) {
    const requestId = intelligenceStableUuid('mineralx-intelligence-execution', `${parsed.proposalId}:${index}`);
    const result = await callRpc(runtime.db, 'mx_ops_command', {
      p_scope: parsed.scopeId,
      p_request: requestId,
      p_action: command.action,
      p_id: command.id,
      p_expected: command.expected,
      p_payload: command.payload,
    });
    executionRequestIds.push(requestId);
    results.push({requestId, action: command.action, id: command.id, version: result?.version, revision: result?.revision});
  }
  const completion = {
    outcome: 'succeeded',
    summary: executionRequestIds.length
      ? `${executionRequestIds.length} approved filing action${executionRequestIds.length === 1 ? '' : 's'} applied.`
      : 'Classification review completed without changing operational records.',
    actions: results,
  };
  const current=await rawIntake(runtime.db,parsed.scopeId,parsed.intakeId);
  if(current.status==='completed')return normalizeIntake(current);
  const response = await callRpc(trustedDatabase(), 'mx_ops_intelligence_complete', {
    p_scope: parsed.scopeId, p_request: parsed.requestId, p_intake: parsed.intakeId,
    p_proposal: parsed.proposalId, p_expected: parsed.expectedVersion,
    p_execution_requests: executionRequestIds, p_result: completion,
  });
  return normalizeIntake(response.record);
}

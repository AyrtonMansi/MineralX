import 'server-only';

import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {classifyDatabaseError, OpsError, type Scope} from '@/lib/ops/contracts';
import {
  analyzeIntake,
  applyIntake,
  approveIntake,
  createIntake,
  intelligenceStableUuid,
  listIntelligence,
  readIntelligence,
} from '@/lib/intelligence/service';
import {stageMcpSource} from './file-transfer';
import {
  canStageMcpSourceFamily,
  isGeologyRecordKind,
  mcpStagedSourcesSchema,
  mcpSourceFamilySchema,
  mineralXRecordKindSchema,
  oauthToolMeta,
  singleOpenAiFileArraySchema,
  type McpSourceFamily,
  uuidCursorBefore,
} from './contracts';
import type {McpPrincipal} from './auth';

const scopeIdSchema = z.string().uuid().describe('An assigned MineralX workspace ID returned by mineralx_context.');
const dataEnvelopeSchema = z.object({data: z.unknown()});

function result(data: unknown) {
  return {
    content: [{type: 'text' as const, text: JSON.stringify(data)}],
    structuredContent: {data},
  };
}

function toolFailure(error: unknown) {
  const known = error instanceof OpsError
    ? error
    : error && typeof error === 'object' && ('code' in error || 'message' in error)
      ? classifyDatabaseError(error as {code?: string; message?: string})
      : new OpsError('unavailable', 'MineralX could not complete this request.');
  return {
    isError: true,
    content: [{type: 'text' as const, text: `${known.code}: ${known.message}`}],
    structuredContent: {data: {error: {code: known.code, message: known.message}}},
  };
}

function assignedScope(principal: McpPrincipal, scopeId: string, permission?: string): Scope {
  const scope = principal.context.scopes.find((candidate) => candidate.id === scopeId);
  if (!scope || permission && !scope.permissions.includes(permission)) {
    throw new OpsError('forbidden', 'This workspace or action is not assigned to the connected account.');
  }
  return scope;
}

async function rpc(principal: McpPrincipal, name: string, args: Record<string, unknown>) {
  const {data, error} = await principal.db.rpc(name, args);
  if (error) throw classifyDatabaseError(error);
  return data;
}

async function geologyPage(
  principal: McpPrincipal,
  scopeId: string,
  kind: string,
  cursor: string | null,
  limit: number,
) {
  assignedScope(principal, scopeId, 'geo.read');
  return rpc(principal, 'mx_ops_geo_page', {
    p_scope: scopeId,
    p_kind: kind,
    p_after: cursor,
    p_limit: limit,
  }) as Promise<{rows?: Array<{id?: string}>; revision?: number; project?: unknown}>;
}

async function exactGeologyRecord(principal: McpPrincipal, scopeId: string, kind: string, recordId: string) {
  const page = await geologyPage(principal, scopeId, kind, uuidCursorBefore(recordId), 1);
  const record = Array.isArray(page?.rows) ? page.rows[0] : undefined;
  if (!record || record.id !== recordId) throw new OpsError('not_found', 'This geology record is not available in the selected workspace.');
  return {record, project: page.project || null, revision: page.revision || null};
}

async function verifiedStagedSources(
  principal: McpPrincipal,
  scope: Scope,
  sourceFamily: McpSourceFamily,
  sources: Array<{fileId: string; sourceReference?: string}>,
) {
  if (!canStageMcpSourceFamily(scope.permissions, sourceFamily)) {
    throw new OpsError('forbidden', 'This account cannot create that evidence-family intake in the selected workspace.');
  }
  return Promise.all(sources.map(async (source) => {
    const rows = await rpc(principal, 'mx_ops_files', {p_scope: scope.id, p_id: source.fileId});
    const record = Array.isArray(rows) ? rows[0] as Record<string, unknown> | undefined : undefined;
    if (!record || record.id !== source.fileId || record.status !== 'verified') {
      throw new OpsError('validation', 'Every staged source must be an integrity-verified file in the selected workspace.');
    }
    if (record.family !== sourceFamily) {
      throw new OpsError('validation', 'Every staged source must belong to the explicitly selected evidence family. Split mixed families into separate intakes.');
    }
    return record;
  }));
}

export function createMineralXMcpServer(principal: McpPrincipal) {
  const server = new McpServer({name: 'mineralx-intelligence', version: '1.0.0'}, {
    instructions: [
      'MineralX is the source of truth. Use read tools before proposing changes.',
      'Never invent measured values, project identity, evidence, approvals or record versions.',
      'For a file dump, first call stage_mineralx_source once per file, then place each returned object unchanged in create_mineralx_intake.sources.',
      'After creation, call analyze_mineralx_intake repeatedly while the intake remains received; each call advances one durable phase and processing stops at a reviewable proposal.',
      'Authoritative changes require the proposal to be explicitly approved and then separately applied by the user.',
      'Never infer an evidence security family: ask the user to choose geo, plant, gold or custody when it is not explicit, and split mixed-family sources into separate intakes.',
      'A tool error is a control decision; explain it and do not bypass it with a different tool.',
    ].join(' '),
  });

  server.registerTool('mineralx_context', {
    title: 'Get MineralX context',
    description: 'List the connected user, assigned workspaces, permissions, schema version and assurance level. Call this before accessing MineralX data.',
    inputSchema: z.object({}).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async () => result({
    userId: principal.context.userId,
    scopes: principal.context.scopes,
    organisations: principal.context.organisations,
    assuranceLevel: principal.context.aal,
    schemaVersion: principal.context.schemaVersion,
    asOf: principal.context.asOf,
  }));

  server.registerTool('search_mineralx', {
    title: 'Search MineralX',
    description: 'Search authorised operational records in one MineralX workspace. This is read-only and returns stable record IDs for follow-up retrieval.',
    inputSchema: z.object({
      scopeId: scopeIdSchema,
      query: z.string().trim().min(2).max(160).describe('Exact identifier or concise search phrase.'),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, query}) => {
    try {
      assignedScope(principal, scopeId);
      return result(await rpc(principal, 'mx_ops_search', {p_scope: scopeId, p_query: query}));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('get_mineralx_record', {
    title: 'Get a MineralX record',
    description: 'Retrieve one authorised operational or geology record. Standard operational records include related evidence and history; geology records include their current version and project revision.',
    inputSchema: z.object({
      scopeId: scopeIdSchema,
      kind: mineralXRecordKindSchema.describe('The record register returned by search_mineralx or list_mineralx_records.'),
      recordId: z.string().uuid(),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, kind, recordId}) => {
    try {
      assignedScope(principal, scopeId);
      if (isGeologyRecordKind(kind)) return result(await exactGeologyRecord(principal, scopeId, kind, recordId));
      return result(await rpc(principal, 'mx_ops_detail', {p_scope: scopeId, p_kind: kind, p_id: recordId}));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('list_mineralx_records', {
    title: 'List MineralX records',
    description: 'List a bounded page from one authorised MineralX operational or geology register. Use the returned cursor to continue and get_mineralx_record for one full record.',
    inputSchema: z.object({
      scopeId: scopeIdSchema,
      kind: mineralXRecordKindSchema.describe('The MineralX register to list.'),
      cursor: z.string().uuid().optional().describe('The cursor returned by the previous page. Omit for the first page.'),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, kind, cursor, limit}) => {
    try {
      assignedScope(principal, scopeId);
      if (!isGeologyRecordKind(kind)) {
        return result(await rpc(principal, 'mx_ops_list', {
          p_scope: scopeId, p_kind: kind, p_after: cursor || null, p_limit: limit, p_id: null,
        }));
      }
      const page = await geologyPage(principal, scopeId, kind, cursor || null, limit);
      const rows = Array.isArray(page?.rows) ? page.rows : [];
      const next = rows.length === limit ? rows[rows.length - 1]?.id || null : null;
      return result({...page, next});
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('list_mineralx_intakes', {
    title: 'List MineralX intelligence intakes',
    description: 'List a bounded page of authorised file dumps and their review state in one workspace. Source bytes remain in MineralX private storage.',
    inputSchema: z.object({
      scopeId: scopeIdSchema,
      cursor: z.string().uuid().optional().describe('The cursor returned by the previous intake page. Omit for the first page.'),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, cursor, limit}) => {
    try {
      assignedScope(principal, scopeId, 'work.read');
      return result(await listIntelligence(principal.db, scopeId, {cursor, limit}));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('get_mineralx_intake', {
    title: 'Get a MineralX intelligence intake',
    description: 'Retrieve one intake, its immutable source identities, proposal, warnings, approval and execution lineage.',
    inputSchema: z.object({scopeId: scopeIdSchema, intakeId: z.string().uuid()}).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, intakeId}) => {
    try {
      assignedScope(principal, scopeId, 'work.read');
      return result(await readIntelligence(principal.db, scopeId, intakeId));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('stage_mineralx_source', {
    title: 'Stage one MineralX source',
    description: 'Transfer exactly one ChatGPT file into private MineralX evidence storage, verify its real type, signature and SHA-256 digest, and return a strict stable source identity that can be placed unchanged in create_mineralx_intake.sources. This bounded step preserves the original but does not malware-scan it or create an intake.',
    inputSchema: z.object({
      scopeId: scopeIdSchema,
      idempotencyKey: z.string().trim().min(8).max(200).describe('A stable unique key for this one logical source upload. Reuse it exactly when retrying this file.'),
      sourceFamily: mcpSourceFamilySchema.describe('The evidence register explicitly selected by the user. Ask before calling if it is ambiguous; use separate intakes for mixed families.'),
      files: singleOpenAiFileArraySchema.describe('Exactly one file selected or uploaded in ChatGPT.'),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
    _meta: oauthToolMeta({'openai/fileParams': ['files']}),
  }, async ({scopeId, idempotencyKey, sourceFamily, files}) => {
    try {
      assignedScope(principal, scopeId, 'work.write');
      const identity = `${principal.authInfo.clientId}:${principal.user.id}:${scopeId}:${idempotencyKey}`;
      const requestId = intelligenceStableUuid('mineralx-mcp-stage', identity);
      return result(await stageMcpSource(principal, scopeId, files[0], sourceFamily, {requestId}));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('create_mineralx_intake', {
    title: 'Create a MineralX file-dump intake',
    description: 'Create a fast, durable received intake from 1 to 20 source objects returned by stage_mineralx_source; pass those objects unchanged. Every source must belong to the same explicitly selected evidence family. This does not scan, analyze, propose, approve or apply changes; call analyze_mineralx_intake next.',
    inputSchema: z.object({
      scopeId: scopeIdSchema,
      idempotencyKey: z.string().trim().min(8).max(200).describe('A stable unique key for this logical intake. Reuse it exactly when retrying.'),
      title: z.string().trim().min(3).max(240).optional(),
      instructions: z.string().trim().max(4000).default('Organize these sources in MineralX.'),
      sourceFamily: mcpSourceFamilySchema.describe('The one evidence register explicitly selected by the user for every staged source.'),
      sources: mcpStagedSourcesSchema.describe('Between 1 and 20 strict source objects returned by stage_mineralx_source. Pass each returned object unchanged.'),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, idempotencyKey, title, instructions, sourceFamily, sources}) => {
    try {
      const scope = assignedScope(principal, scopeId, 'work.write');
      const records = await verifiedStagedSources(principal, scope, sourceFamily, sources);
      const identity = `${principal.authInfo.clientId}:${principal.user.id}:${scopeId}:${idempotencyKey}`;
      const intakeId = intelligenceStableUuid('mineralx-mcp-intake', identity);
      const requestId = intelligenceStableUuid('mineralx-mcp-create', identity);
      const firstName = typeof records[0]?.name === 'string' ? records[0].name : 'Staged sources';
      const record = await createIntake({db: principal.db, actorId: principal.user.id, scope}, {
        scopeId,
        intakeId,
        requestId,
        title: title || `Intake — ${firstName}`.slice(0, 240),
        instructions,
        sources,
      });
      return result(record);
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('analyze_mineralx_intake', {
    title: 'Advance MineralX intake analysis',
    description: 'Advance exactly one durable processing phase for a received intake. A call scans one pending source or, after every source is clean, prepares the governed proposal. Call again while status is received and stop when status is proposed. This never approves or applies operational changes.',
    inputSchema: z.object({scopeId: scopeIdSchema, intakeId: z.string().uuid()}).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
    _meta: oauthToolMeta(),
  }, async ({scopeId, intakeId}) => {
    try {
      const scope = assignedScope(principal, scopeId, 'work.write');
      return result(await analyzeIntake({db: principal.db, actorId: principal.user.id, scope}, {scopeId, intakeId}));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('approve_mineralx_intake', {
    title: 'Approve a MineralX intake proposal',
    description: 'Only call this after the user explicitly approves the displayed proposal. Record that named human approval for the current version; this does not apply the actions. Mutating proposals require an MFA-verified session.',
    inputSchema: z.object({
      scopeId: scopeIdSchema, intakeId: z.string().uuid(), proposalId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
      reason: z.string().trim().min(3).max(1000),
      idempotencyKey: z.string().trim().min(8).max(200),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, intakeId, proposalId, expectedVersion, reason, idempotencyKey}) => {
    try {
      const scope = assignedScope(principal, scopeId, 'work.write');
      const requestId = intelligenceStableUuid('mineralx-mcp-approve', `${principal.authInfo.clientId}:${principal.user.id}:${scopeId}:${idempotencyKey}`);
      return result(await approveIntake({db: principal.db, actorId: principal.user.id, scope}, {
        scopeId, intakeId, proposalId, expectedVersion, reason, requestId,
      }));
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool('apply_mineralx_intake', {
    title: 'Apply an approved MineralX intake',
    description: 'Only call this after the user separately and explicitly asks to apply the approved proposal. Apply exactly the approved, versioned MineralX commands and record their receipts; no new interpretation occurs during execution.',
    inputSchema: z.object({
      scopeId: scopeIdSchema, intakeId: z.string().uuid(), proposalId: z.string().uuid(),
      expectedVersion: z.number().int().positive(), idempotencyKey: z.string().trim().min(8).max(200),
    }).strict(),
    outputSchema: dataEnvelopeSchema,
    annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
    _meta: oauthToolMeta(),
  }, async ({scopeId, intakeId, proposalId, expectedVersion, idempotencyKey}) => {
    try {
      const scope = assignedScope(principal, scopeId, 'work.write');
      const requestId = intelligenceStableUuid('mineralx-mcp-complete', `${principal.authInfo.clientId}:${principal.user.id}:${scopeId}:${idempotencyKey}`);
      return result(await applyIntake({db: principal.db, actorId: principal.user.id, scope}, {
        scopeId, intakeId, proposalId, expectedVersion, requestId,
      }));
    } catch (error) { return toolFailure(error); }
  });

  return server;
}

export type MineralXMcpServer = ReturnType<typeof createMineralXMcpServer>;

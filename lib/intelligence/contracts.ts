import {z} from 'zod';

export const INTELLIGENCE_CONTRACT_VERSION=1 as const;

const cleanText=(maximum:number)=>z.string().trim().min(1).max(maximum).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'Control characters are not permitted.');
export const confidenceSchema=z.number().finite().min(0).max(1);
export const sha256Schema=z.string().regex(/^[a-f0-9]{64}$/,'Expected a lowercase SHA-256 digest.');
export const actionNameSchema=z.string().min(3).max(80).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/,'Expected a namespaced action name.');
export const sourceReferenceSchema=z.string().trim().max(500).refine(
  value=>!/(?:^[\s]*(?:(?:https?|ftp|file|data):|\/\/)|:\/\/)/i.test(value),
  'Store a source reference, not a download URL.',
);

export const fileReferenceSchema=z.object({
  id:z.string().uuid(),
  scopeId:z.string().uuid(),
  version:z.number().int().min(0).max(2147483646),
  name:cleanText(255).refine(value=>value!=='.'&&value!=='..'&&!/[\\/]/.test(value),'Expected a file name, not a path.'),
  mediaType:z.string().min(3).max(127).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
  sizeBytes:z.number().int().positive().max(10*1024*1024*1024),
  sha256:sha256Schema,
  trust:z.enum(['quarantined','verified']),
}).strict();
export type FileReference=z.infer<typeof fileReferenceSchema>;

export const resourceKindSchema=z.enum([
  'file','document','feed_lot','processing_campaign','processing_run','gold_lot','weight','assay',
  'custody_transfer','reconciliation_period','work_item','allocation','settlement','geology_sample',
  'geology_collar','geology_program','geology_target','geology_dispatch','geology_assay','geology_log',
  'geology_layer','workflow_program','task','person','asset','fuel','energy','engineering_revision',
  'program_cost','spare','meeting','unknown',
]);
export type ResourceKind=z.infer<typeof resourceKindSchema>;

export const recordReferenceSchema=z.object({
  scopeId:z.string().uuid(),
  resource:resourceKindSchema.exclude(['unknown']),
  id:z.string().uuid(),
  expectedVersion:z.number().int().min(0).max(2147483646),
}).strict();
export type RecordReference=z.infer<typeof recordReferenceSchema>;

export const intakeInstructionSchema=z.object({
  id:z.string().uuid(),
  scopeId:z.string().uuid(),
  files:z.array(fileReferenceSchema).min(1).max(50),
  outcome:z.enum(['classify','organize','extract','clean','propose_record_changes']),
  instruction:cleanText(4000).optional(),
  destinationHint:z.object({
    resource:resourceKindSchema.exclude(['unknown']),
    action:actionNameSchema.optional(),
  }).strict().optional(),
  targetRecord:recordReferenceSchema.optional(),
  preserveOriginal:z.literal(true).default(true),
}).strict().superRefine((value,context)=>{
  const ids=new Set<string>();
  for(const [index,file] of value.files.entries()){
    if(file.scopeId!==value.scopeId)context.addIssue({code:'custom',path:['files',index,'scopeId'],message:'Every file must belong to the intake scope.'});
    if(ids.has(file.id))context.addIssue({code:'custom',path:['files',index,'id'],message:'A file may appear only once in an intake.'});
    ids.add(file.id);
  }
  if(value.targetRecord?.scopeId!==undefined&&value.targetRecord.scopeId!==value.scopeId)context.addIssue({code:'custom',path:['targetRecord','scopeId'],message:'The target record must belong to the intake scope.'});
  if(value.targetRecord&&value.destinationHint&&value.targetRecord.resource!==value.destinationHint.resource)context.addIssue({code:'custom',path:['destinationHint','resource'],message:'The destination hint and target record must use the same resource type.'});
  if(value.outcome==='propose_record_changes'&&!value.targetRecord)context.addIssue({code:'custom',path:['targetRecord'],message:'Existing-record changes require an explicit versioned target.'});
});
export type IntakeInstruction=z.infer<typeof intakeInstructionSchema>;

const forbiddenPointerSegments=new Set(['__proto__','prototype','constructor']);
export function decodeJsonPointer(pointer:string){
  return pointer.slice(1).split('/').map(segment=>segment.replaceAll('~1','/').replaceAll('~0','~'));
}
export function isSafeJsonPointer(pointer:string){
  if(pointer.length<2||pointer.length>300||pointer[0]!=='/'||/(?:~(?![01]))/.test(pointer))return false;
  const segments=decodeJsonPointer(pointer);
  return segments.length<=12&&segments.every(segment=>segment.length>0&&segment.length<=80&&!forbiddenPointerSegments.has(segment));
}
export const jsonPointerSchema=z.string().refine(isSafeJsonPointer,'Expected a safe, non-root JSON Pointer.');

export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
const jsonKeySchema=z.string().min(1).max(128).refine(key=>!forbiddenPointerSegments.has(key),'Unsafe object key.');
export const jsonValueSchema:z.ZodType<JsonValue>=z.lazy(()=>z.union([
  z.null(),z.boolean(),z.number().finite(),z.string().max(100_000),z.array(jsonValueSchema).max(1000),z.record(jsonKeySchema,jsonValueSchema),
]));

export const sourceLocatorSchema=z.object({
  page:z.number().int().positive().max(100_000).optional(),
  sheet:cleanText(120).optional(),
  rowStart:z.number().int().positive().max(10_000_000).optional(),
  rowEnd:z.number().int().positive().max(10_000_000).optional(),
  cell:z.string().trim().min(1).max(40).regex(/^[A-Z]{1,4}[1-9][0-9]*(?::[A-Z]{1,4}[1-9][0-9]*)?$/).optional(),
  charStart:z.number().int().min(0).max(100_000_000).optional(),
  charEnd:z.number().int().positive().max(100_000_000).optional(),
  quote:cleanText(500).optional(),
}).strict().superRefine((value,context)=>{
  if(value.rowEnd!==undefined&&value.rowStart===undefined)context.addIssue({code:'custom',path:['rowStart'],message:'rowStart is required when rowEnd is supplied.'});
  if(value.rowStart!==undefined&&value.rowEnd!==undefined&&value.rowEnd<value.rowStart)context.addIssue({code:'custom',path:['rowEnd'],message:'rowEnd cannot precede rowStart.'});
  if(value.charEnd!==undefined&&value.charStart===undefined)context.addIssue({code:'custom',path:['charStart'],message:'charStart is required when charEnd is supplied.'});
  if(value.charStart!==undefined&&value.charEnd!==undefined&&value.charEnd<=value.charStart)context.addIssue({code:'custom',path:['charEnd'],message:'charEnd must be greater than charStart.'});
});

export const sourceProvenanceSchema=z.object({
  fileId:z.string().uuid(),
  sha256:sha256Schema,
  locator:sourceLocatorSchema.optional(),
}).strict();
export type SourceProvenance=z.infer<typeof sourceProvenanceSchema>;

export const generationProvenanceSchema=z.object({
  kind:z.enum(['model','deterministic']),
  provider:cleanText(80),
  model:cleanText(120),
  promptVersion:cleanText(80),
}).strict();
export type GenerationProvenance=z.infer<typeof generationProvenanceSchema>;

export const warningCodeSchema=z.enum([
  'ambiguous_destination','conflicting_values','low_confidence','missing_required_field','policy_violation',
  'provider_failure','provider_output_invalid','source_unverified','unsupported_format','manual_review_required',
  'unmapped_content','unit_ambiguous','identity_ambiguous',
]);
export const proposalWarningSchema=z.object({
  code:warningCodeSchema,
  severity:z.enum(['info','warning','error']),
  message:cleanText(500),
  path:jsonPointerSchema.optional(),
  blocksAutomation:z.boolean(),
  provenance:z.array(sourceProvenanceSchema).max(20).default([]),
}).strict();
export type ProposalWarning=z.infer<typeof proposalWarningSchema>;

export const documentKindSchema=z.enum([
  'assay_certificate','drill_log','sample_dispatch','survey','map_or_spatial','operational_log','weighing_record',
  'custody_record','invoice_or_settlement','meeting_notes','procedure_or_plan','report','spreadsheet','image','unknown',
]);
export const classificationProposalSchema=z.object({
  kind:documentKindSchema,
  confidence:confidenceSchema,
  rationale:cleanText(600),
  provenance:z.array(sourceProvenanceSchema).min(1).max(20),
  warnings:z.array(proposalWarningSchema).max(30).default([]),
}).strict();

export const mappingTargetSchema=z.object({
  resource:resourceKindSchema.exclude(['unknown']),
  operation:z.enum(['create','update','attach']),
  action:actionNameSchema,
  record:recordReferenceSchema.optional(),
  schemaVersion:z.number().int().positive().max(10_000),
}).strict().superRefine((value,context)=>{
  if(value.operation==='create'&&value.record)context.addIssue({code:'custom',path:['record'],message:'Create proposals cannot identify an existing record.'});
  if(value.operation!=='create'&&!value.record)context.addIssue({code:'custom',path:['record'],message:'Update and attachment proposals require a versioned target record.'});
  if(value.record&&value.record.resource!==value.resource)context.addIssue({code:'custom',path:['record','resource'],message:'The record and mapping target resource must match.'});
});

export const fieldMappingSchema=z.object({
  source:sourceProvenanceSchema,
  targetPath:jsonPointerSchema,
  transform:z.enum(['direct','trim','parse_date','parse_decimal','normalize_identifier','normalize_unit','lookup_reference','derived']),
  confidence:confidenceSchema,
}).strict();

export const schemaMappingProposalSchema=z.object({
  target:mappingTargetSchema,
  fields:z.array(fieldMappingSchema).min(1).max(200),
  confidence:confidenceSchema,
  warnings:z.array(proposalWarningSchema).max(50).default([]),
}).strict();
export type SchemaMappingProposal=z.infer<typeof schemaMappingProposalSchema>;

const patchEvidence=z.object({
  path:jsonPointerSchema,
  confidence:confidenceSchema,
  rationale:cleanText(500),
  provenance:z.array(sourceProvenanceSchema).min(1).max(20),
}).strict();
const setPatchSchema=patchEvidence.extend({op:z.literal('set'),value:jsonValueSchema}).strict();
const removePatchSchema=patchEvidence.extend({op:z.literal('remove')}).strict();
export const fieldPatchSchema=z.discriminatedUnion('op',[setPatchSchema,removePatchSchema]);
export type FieldPatch=z.infer<typeof fieldPatchSchema>;

export const documentProposalSchema=z.object({
  fileId:z.string().uuid(),
  sourceSha256:sha256Schema,
  classification:classificationProposalSchema,
  mapping:schemaMappingProposalSchema.nullable(),
  patches:z.array(fieldPatchSchema).max(200),
  confidence:confidenceSchema,
  warnings:z.array(proposalWarningSchema).max(50).default([]),
}).strict().superRefine((value,context)=>{
  if(!value.mapping&&value.patches.length)context.addIssue({code:'custom',path:['patches'],message:'Field patches require a schema mapping target.'});
  if(value.mapping){
    const mapped=new Set(value.mapping.fields.map(field=>field.targetPath));
    for(const [index,patch] of value.patches.entries())if(!mapped.has(patch.path))context.addIssue({code:'custom',path:['patches',index,'path'],message:'Every patch must have a cited field mapping.'});
  }
});
export type DocumentProposal=z.infer<typeof documentProposalSchema>;

export const intelligencePlanSchema=z.object({
  version:z.literal(INTELLIGENCE_CONTRACT_VERSION),
  intakeId:z.string().uuid(),
  scopeId:z.string().uuid(),
  generation:generationProvenanceSchema,
  documents:z.array(documentProposalSchema).min(1).max(50),
  confidence:confidenceSchema,
  summary:cleanText(1000),
  warnings:z.array(proposalWarningSchema).max(100).default([]),
}).strict();
export type IntelligencePlan=z.infer<typeof intelligencePlanSchema>;

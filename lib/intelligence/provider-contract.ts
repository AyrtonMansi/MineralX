import {z} from 'zod';
import {
  confidenceSchema,
  documentKindSchema,
  sha256Schema,
  warningCodeSchema,
  type FileReference,
  type IntakeInstruction,
} from './contracts';
import {documentCategories} from './catalog';

/** OpenAI's limit is expressed in decimal MB and requires each file to be
 * below 50 MB. MineralX's private store remains independently capped at 50 MiB. */
export const OPENAI_FILE_INPUT_LIMIT_BYTES=50_000_000;
export const OPENAI_FILES_PER_REQUEST=8;

const OPENAI_FILE_MEDIA_TYPES=new Set([
  'application/pdf','text/csv','text/plain','application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function openAiCanReadFile(file:FileReference){
  return file.mediaType.startsWith('image/')||OPENAI_FILE_MEDIA_TYPES.has(file.mediaType);
}

export function partitionOpenAiInputFiles(files:readonly FileReference[]){
  const batches:FileReference[][]=[];
  const excluded=new Map<string,'unsupported_format'|'file_too_large'>();
  let current:FileReference[]=[];
  let currentBytes=0;
  let totalBytes=0;
  for(const file of files){
    if(!openAiCanReadFile(file)){excluded.set(file.id,'unsupported_format');continue;}
    if(file.sizeBytes>=OPENAI_FILE_INPUT_LIMIT_BYTES){excluded.set(file.id,'file_too_large');continue;}
    if(current.length&&(current.length>=OPENAI_FILES_PER_REQUEST
      ||currentBytes+file.sizeBytes>=OPENAI_FILE_INPUT_LIMIT_BYTES)){
      batches.push(current);current=[];currentBytes=0;
    }
    current.push(file);
    currentBytes+=file.sizeBytes;
    totalBytes+=file.sizeBytes;
  }
  if(current.length)batches.push(current);
  return {batches,excluded,totalBytes};
}

/* OpenAI strict Structured Outputs requires every property to be required and
 * every object to disallow additional properties. Nullable fields are
 * converted back to omitted domain optionals after receipt. The current
 * trusted action accepts string title/category patches only, so the provider
 * never needs the recursive arbitrary-JSON patch schema used by the domain. */
const providerLocatorSchema=z.object({
  page:z.number().int().positive().nullable(),
  sheet:z.string().max(120).nullable(),
  rowStart:z.number().int().positive().nullable(),
  rowEnd:z.number().int().positive().nullable(),
  cell:z.string().max(40).nullable(),
  charStart:z.number().int().nonnegative().nullable(),
  charEnd:z.number().int().positive().nullable(),
  quote:z.string().max(500).nullable(),
}).strict();

const providerSourceSchema=z.object({
  fileId:z.string(),sha256:sha256Schema,locator:providerLocatorSchema.nullable(),
}).strict();

const providerWarningSchema=z.object({
  code:warningCodeSchema,severity:z.enum(['info','warning','error']),message:z.string().max(500),
  path:z.string().nullable(),blocksAutomation:z.boolean(),provenance:z.array(providerSourceSchema).max(20),
}).strict();

const providerClassificationSchema=z.object({
  kind:documentKindSchema,confidence:confidenceSchema,rationale:z.string().max(600),
  provenance:z.array(providerSourceSchema).min(1).max(20),warnings:z.array(providerWarningSchema).max(30),
}).strict();

const providerFieldSchema=z.object({
  source:providerSourceSchema,targetPath:z.enum(['/title','/category']),
  transform:z.enum(['direct','trim','normalize_identifier']),confidence:confidenceSchema,
}).strict();

const providerMappingSchema=z.object({
  target:z.object({
    resource:z.literal('document'),operation:z.literal('create'),action:z.literal('document.publish'),
    record:z.null(),schemaVersion:z.literal(1),
  }).strict(),
  fields:z.array(providerFieldSchema).min(1).max(2),confidence:confidenceSchema,
  warnings:z.array(providerWarningSchema).max(50),
}).strict();

const providerPatchSchema=z.object({
  op:z.literal('set'),confidence:confidenceSchema,rationale:z.string().max(500),
  provenance:z.array(providerSourceSchema).min(1).max(20),
  path:z.enum(['/title','/category']),value:z.string().trim().min(1).max(240)
    .refine(value=>!/[\u0000-\u001f\u007f]/.test(value),'Control characters are not permitted.'),
}).strict().superRefine((value,context)=>{
  if(value.path==='/title'&&value.value.trim().length<3)context.addIssue({code:'custom',path:['value'],message:'A title needs at least three characters.'});
  if(value.path==='/category'&&!(documentCategories as readonly string[]).includes(value.value))context.addIssue({code:'custom',path:['value'],message:'Use a registered document category.'});
});

const providerDocumentSchema=z.object({
  fileId:z.string(),sourceSha256:sha256Schema,classification:providerClassificationSchema,
  mapping:providerMappingSchema.nullable(),patches:z.array(providerPatchSchema).max(2),
  confidence:confidenceSchema,warnings:z.array(providerWarningSchema).max(50),
}).strict().superRefine((value,context)=>{
  if(!value.mapping)return;
  const fields=new Set(value.mapping.fields.map(field=>field.targetPath));
  const patches=new Set(value.patches.map(patch=>patch.path));
  for(const path of ['/title','/category'] as const){
    if(!fields.has(path))context.addIssue({code:'custom',path:['mapping','fields'],message:`A document filing must map ${path}.`});
    if(!patches.has(path))context.addIssue({code:'custom',path:['patches'],message:`A document filing must propose ${path}.`});
  }
});

export const openAiIntelligencePlanSchema=z.object({
  version:z.literal(1),intakeId:z.string(),scopeId:z.string(),
  documents:z.array(providerDocumentSchema).min(1).max(20),
  confidence:confidenceSchema,summary:z.string().min(3).max(1000),
  warnings:z.array(providerWarningSchema).max(100),
}).strict();

type ProviderPlan=z.infer<typeof openAiIntelligencePlanSchema>;
type ProviderSource=z.infer<typeof providerSourceSchema>;
type ProviderWarning=z.infer<typeof providerWarningSchema>;

function compactLocator(locator:ProviderSource['locator']){
  if(!locator)return undefined;
  const entries=Object.entries(locator).filter(([,value])=>value!==null);
  return entries.length?Object.fromEntries(entries):undefined;
}

function domainSource(source:ProviderSource){
  const locator=compactLocator(source.locator);
  return {fileId:source.fileId,sha256:source.sha256,...(locator?{locator}:{})};
}

function domainWarning(warning:ProviderWarning){
  return {
    code:warning.code,severity:warning.severity,message:warning.message,
    ...(warning.path===null?{}:{path:warning.path}),blocksAutomation:warning.blocksAutomation,
    provenance:warning.provenance.map(domainSource),
  };
}

export function openAiPlanToDomain(plan:ProviderPlan){
  return {
    version:plan.version,intakeId:plan.intakeId,scopeId:plan.scopeId,
    documents:plan.documents.map(document=>({
      fileId:document.fileId,sourceSha256:document.sourceSha256,
      classification:{
        ...document.classification,
        provenance:document.classification.provenance.map(domainSource),
        warnings:document.classification.warnings.map(domainWarning),
      },
      mapping:document.mapping?{
        target:{
          resource:document.mapping.target.resource,operation:document.mapping.target.operation,
          action:document.mapping.target.action,schemaVersion:document.mapping.target.schemaVersion,
        },
        fields:document.mapping.fields.map(field=>({...field,source:domainSource(field.source)})),
        confidence:document.mapping.confidence,warnings:document.mapping.warnings.map(domainWarning),
      }:null,
      patches:document.patches.map(patch=>({...patch,provenance:patch.provenance.map(domainSource)})),
      confidence:document.confidence,warnings:document.warnings.map(domainWarning),
    })),
    confidence:plan.confidence,summary:plan.summary,warnings:plan.warnings.map(domainWarning),
  };
}

export type OpenAiBoundaryReason='unsupported_format'|'file_too_large'|'not_available';

function metadataClassification(file:FileReference){
  const name=file.name.toLowerCase();
  if(/\.(?:geojson|kml|kmz|las|laz)$/.test(name))return {kind:'map_or_spatial' as const,confidence:0.35,rationale:'The file name identifies a spatial or survey source; this provider did not inspect its contents.'};
  return {kind:'unknown' as const,confidence:0.1,rationale:'This provider did not inspect the file contents, so metadata is insufficient for a reliable classification.'};
}

function metadataDocument(file:FileReference,reason:OpenAiBoundaryReason){
  const classification=metadataClassification(file);
  const message=reason==='file_too_large'
    ?'The original was preserved, but it is 50 MB or larger and was not sent to this provider. No filing action was created for it.'
    :reason==='unsupported_format'
      ?'The original was preserved, but this provider cannot inspect its format. No filing action was created for it.'
      :'The original was preserved, but it was not available to the provider. No filing action was created for it.';
  const warning={
    code:reason==='unsupported_format'?'unsupported_format' as const:'manual_review_required' as const,
    severity:'warning' as const,message,blocksAutomation:false,
    provenance:[{fileId:file.id,sha256:file.sha256}],
  };
  return {
    fileId:file.id,sourceSha256:file.sha256,
    classification:{...classification,provenance:[{fileId:file.id,sha256:file.sha256}],warnings:[warning]},
    mapping:null,patches:[],confidence:classification.confidence,warnings:[],
  };
}

export function mergeOpenAiBatchPlans(
  instruction:IntakeInstruction,
  plans:ReturnType<typeof openAiPlanToDomain>[],
  excluded:ReadonlyMap<string,OpenAiBoundaryReason>,
){
  const providerDocuments=plans.flatMap(plan=>plan.documents);
  const providerIds=providerDocuments.map(document=>document.fileId);
  if(new Set(providerIds).size!==providerIds.length)return null;
  const byFile=new Map(providerDocuments.map(document=>[document.fileId,document]));
  if(providerIds.some(id=>!instruction.files.some(file=>file.id===id)))return null;
  const documents=instruction.files.map(file=>byFile.get(file.id)??metadataDocument(
    file,excluded.get(file.id)??'not_available',
  ));
  const metadataCount=documents.filter(document=>document.mapping===null&&!byFile.has(document.fileId)).length;
  const summaries=plans.map(plan=>plan.summary.trim()).filter(Boolean);
  const summary=[
    ...summaries,
    ...(metadataCount?[`${metadataCount} unsupported or oversized original${metadataCount===1?' was':'s were'} retained without filing actions.`]:[]),
  ].join(' ').slice(0,1000);
  return {
    version:1 as const,intakeId:instruction.id,scopeId:instruction.scopeId,documents,
    confidence:Math.min(...documents.map(document=>document.confidence),...plans.map(plan=>plan.confidence)),
    summary,warnings:plans.flatMap(plan=>plan.warnings).slice(0,100),
  };
}

export function openAiStrictJsonSchema(){
  const generated=z.toJSONSchema(openAiIntelligencePlanSchema,{io:'output',reused:'ref'}) as Record<string,unknown>;
  const {$schema:_dialect,...schema}=generated;
  return schema;
}

export function strictSchemaViolations(schema:unknown){
  const violations:string[]=[];
  if(!schema||typeof schema!=='object'||Array.isArray(schema)||(schema as {type?:unknown}).type!=='object'){
    return ['$: strict output must have an object root'];
  }
  const root=schema as Record<string,unknown>;
  const definitions=root.$defs&&typeof root.$defs==='object'&&!Array.isArray(root.$defs)
    ?root.$defs as Record<string,unknown>:{};
  const seen=new WeakSet<object>();
  let propertyCount=0,stringBudget=0;
  const unsupported=new Set(['allOf','oneOf','not','if','then','else','$schema']);
  const visit=(value:unknown,path:string)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    const node=value as Record<string,unknown>;
    if(seen.has(node))return;
    seen.add(node);
    if(!Object.keys(node).length)violations.push(`${path}: unconstrained schemas are not permitted`);
    for(const keyword of unsupported)if(keyword in node)violations.push(`${path}: ${keyword} is not supported`);
    if(node.type==='object'||node.properties){
      const properties=node.properties&&typeof node.properties==='object'&&!Array.isArray(node.properties)
        ?node.properties as Record<string,unknown>:{};
      const keys=Object.keys(properties).sort();
      propertyCount+=keys.length;
      stringBudget+=keys.reduce((total,key)=>total+key.length,0);
      const required=Array.isArray(node.required)?node.required.filter(item=>typeof item==='string').sort():[];
      if(node.additionalProperties!==false)violations.push(`${path}: additionalProperties must be false`);
      if(JSON.stringify(keys)!==JSON.stringify(required))violations.push(`${path}: every property must be required`);
    }
    if(Array.isArray(node.enum))stringBudget+=node.enum.reduce((total,item)=>total+(typeof item==='string'?item.length:0),0);
    if(typeof node.const==='string')stringBudget+=node.const.length;
    for(const [key,child] of Object.entries(node)){
      if(key==='properties'&&child&&typeof child==='object'&&!Array.isArray(child)){
        for(const [property,definition] of Object.entries(child as Record<string,unknown>))visit(definition,`${path}.properties.${property}`);
      }else if(key==='$defs'&&child&&typeof child==='object'&&!Array.isArray(child)){
        for(const [definition,body] of Object.entries(child as Record<string,unknown>))visit(body,`${path}.$defs.${definition}`);
      }else if(Array.isArray(child))child.forEach((item,index)=>visit(item,`${path}.${key}[${index}]`));
      else if(key!=='properties'&&key!=='$defs')visit(child,`${path}.${key}`);
    }
  };
  visit(schema,'$');
  stringBudget+=Object.keys(definitions).reduce((total,key)=>total+key.length,0);
  const resolve=(value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return value;
    const reference=(value as {$ref?:unknown}).$ref;
    if(typeof reference==='string'&&reference.startsWith('#/$defs/'))return definitions[reference.slice('#/$defs/'.length)];
    return value;
  };
  const depthOf=(value:unknown,depth:number,refs:Set<unknown>):number=>{
    const resolved=resolve(value);
    if(!resolved||typeof resolved!=='object'||Array.isArray(resolved))return depth;
    if(refs.has(resolved))return depth;
    const node=resolved as Record<string,unknown>,nextRefs=new Set(refs).add(resolved);
    const own=node.type==='object'||node.type==='array'?1:0;
    const nextDepth=depth+own;
    const children:unknown[]=[];
    if(node.properties&&typeof node.properties==='object'&&!Array.isArray(node.properties))children.push(...Object.values(node.properties as Record<string,unknown>));
    if(node.items)children.push(node.items);
    if(Array.isArray(node.anyOf))children.push(...node.anyOf);
    return children.reduce<number>((maximum,child)=>Math.max(maximum,depthOf(child,nextDepth,nextRefs)),nextDepth);
  };
  const depth=depthOf(schema,0,new Set());
  if(depth>10)violations.push(`$: schema nesting depth ${depth} exceeds 10`);
  if(propertyCount>100)violations.push(`$: ${propertyCount} object properties exceed 100`);
  if(stringBudget>15_000)violations.push(`$: schema string budget ${stringBudget} exceeds 15000`);
  if(Buffer.byteLength(JSON.stringify(schema),'utf8')>32_000)violations.push('$: schema exceeds the 32 KiB local limit');
  return violations;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIntelligenceEngine,
  MINERALX_INTELLIGENCE_ACTIONS,
  documentCategories,
  documentStorageCategory,
  fieldPatchSchema,
  fileReferenceSchema,
  intelligencePlanSchema,
  intakeInstructionSchema,
  isSafeJsonPointer,
  planningResultNeedsRetry,
  requirePersistablePlanningResult,
  reviewIntelligencePlan,
  sourceReferenceSchema,
  sourceLocatorSchema,
  type IntelligenceActionCatalog,
  type IntelligencePlan,
  type IntakeInstruction,
} from '../../lib/intelligence';
import {evidenceContentViolation} from '../../lib/intelligence/evidence-validation';
import {
  OPENAI_FILE_INPUT_LIMIT_BYTES,
  OPENAI_FILES_PER_REQUEST,
  mergeOpenAiBatchPlans,
  openAiIntelligencePlanSchema,
  openAiPlanToDomain,
  openAiStrictJsonSchema,
  partitionOpenAiInputFiles,
  strictSchemaViolations,
} from '../../lib/intelligence/provider-contract';

const ids={
  intake:'10000000-0000-4000-8000-000000000001',
  scope:'20000000-0000-4000-8000-000000000002',
  otherScope:'30000000-0000-4000-8000-000000000003',
  file:'40000000-0000-4000-8000-000000000004',
  record:'50000000-0000-4000-8000-000000000005',
};
const digest='a'.repeat(64);
const source={fileId:ids.file,sha256:digest};
const file={id:ids.file,scopeId:ids.scope,version:1,name:'drill-log.csv',mediaType:'text/csv',sizeBytes:128,sha256:digest,trust:'verified' as const};
const target={scopeId:ids.scope,resource:'geology_sample' as const,id:ids.record,expectedVersion:3};
const instruction:IntakeInstruction=intakeInstructionSchema.parse({
  id:ids.intake,scopeId:ids.scope,files:[file],outcome:'propose_record_changes',targetRecord:target,
  destinationHint:{resource:'geology_sample',action:'geo.sample.correct'},
});
const catalog:IntelligenceActionCatalog=[{
  action:'geo.sample.correct',resource:'geology_sample',schemaVersion:1,operations:['update'],permission:'geo.capture',
  baselineRisk:'medium',requiresMfa:false,aiPolicy:'propose_only',allowedPatchPrefixes:['/notes','/lithology'],requiredPatchPaths:[],
}];

function plan(overrides:Partial<IntelligencePlan>={}):IntelligencePlan{
  return intelligencePlanSchema.parse({
    version:1,intakeId:ids.intake,scopeId:ids.scope,
    generation:{kind:'model',provider:'test-provider',model:'test-model',promptVersion:'test-v1'},
    documents:[{
      fileId:ids.file,sourceSha256:digest,
      classification:{kind:'drill_log',confidence:0.94,rationale:'The source contains drilling observations.',provenance:[source]},
      mapping:{
        target:{resource:'geology_sample',operation:'update',action:'geo.sample.correct',record:target,schemaVersion:1},
        fields:[{source:{...source,locator:{rowStart:2,rowEnd:2,cell:'D2',quote:'Weathered basalt'}},targetPath:'/notes',transform:'trim',confidence:0.91}],
        confidence:0.91,
      },
      patches:[{op:'set',path:'/notes',value:'Weathered basalt',confidence:0.91,rationale:'Normalized whitespace only.',provenance:[{...source,locator:{rowStart:2,cell:'D2'}}]}],
      confidence:0.91,
    }],
    confidence:0.91,summary:'One field-level correction is ready for review.',
    ...overrides,
  });
}

test('contracts are strict, bounded and reject unsafe field patches',()=>{
  assert.equal(fileReferenceSchema.safeParse({...file,storagePath:'/private/source'}).success,false);
  assert.equal(fileReferenceSchema.safeParse({...file,name:'../../source.csv'}).success,false);
  assert.equal(intakeInstructionSchema.safeParse({...instruction,execute:true}).success,false);
  assert.equal(fieldPatchSchema.safeParse({op:'remove',path:'/notes',value:'hidden',confidence:1,rationale:'Remove it.',provenance:[source]}).success,false);
  assert.equal(isSafeJsonPointer('/notes'),true);
  assert.equal(isSafeJsonPointer('/__proto__/polluted'),false);
  assert.equal(isSafeJsonPointer('/constructor/prototype'),false);
  assert.equal(sourceLocatorSchema.safeParse({rowEnd:8}).success,false);
  assert.equal(sourceLocatorSchema.safeParse({charStart:8,charEnd:2}).success,false);
  assert.equal(sourceReferenceSchema.safeParse('//private.example/source').success,false);
  assert.equal(sourceReferenceSchema.safeParse('  HTTPS://example.test/source').success,false);
  assert.equal(sourceReferenceSchema.safeParse('chatgpt-file-01').success,true);
});

test('native evidence checks declared type against bounded content signatures',()=>{
  const pdf=Buffer.from('%PDF-1.7\n% source');
  assert.equal(evidenceContentViolation(pdf,{name:'report.pdf',mediaType:'application/pdf'}),undefined);
  assert.match(evidenceContentViolation(pdf,{name:'report.csv',mediaType:'text/csv'})||'',/does not match/);
  assert.equal(evidenceContentViolation(Buffer.from('sample,grade\nA,1.2\n'),{name:'assays.csv',mediaType:'text/csv'}),undefined);
  assert.match(evidenceContentViolation(Buffer.from([0x50,0x4b,0x03,0x04,1,2,3]),{name:'dump.zip',mediaType:'application/zip'})||'',/ZIP archives/);
  assert.equal(evidenceContentViolation(Buffer.from('LASF\0\0\0\0'),{name:'survey.las',mediaType:'application/octet-stream'}),undefined);
});

test('document filing uses only the existing governed storage vocabulary',()=>{
  assert.deepEqual(documentCategories,['procedure','plan','handover','certificate','decision','other']);
  assert.equal(documentStorageCategory('assay_certificate'),'certificate');
  assert.equal(documentStorageCategory('procedure_or_plan'),'plan');
  assert.equal(documentStorageCategory('drill_log'),'other');
  assert.equal(MINERALX_INTELLIGENCE_ACTIONS[0].requiresMfa,true);
});

test('provider structured-output schema meets strict object requirements',()=>{
  const schema=openAiStrictJsonSchema();
  assert.deepEqual(strictSchemaViolations(schema),[]);
  assert.doesNotMatch(JSON.stringify(schema),/"additionalProperties":\s*\{/);
  assert.equal('$schema' in schema,false);
  assert.ok(strictSchemaViolations({...schema,oneOf:[]}).some(issue=>issue.includes('oneOf')));
});

test('provider file partitioning keeps every request below its stricter 50 MB boundary',()=>{
  const secondId='40000000-0000-4000-8000-000000000014';
  const thirdId='40000000-0000-4000-8000-000000000024';
  const selection=partitionOpenAiInputFiles([
    {...file,sizeBytes:30_000_000},
    {...file,id:secondId,sizeBytes:25_000_000},
    {...file,id:thirdId,sizeBytes:OPENAI_FILE_INPUT_LIMIT_BYTES},
  ]);
  assert.deepEqual(selection.batches.map(batch=>batch.map(item=>item.id)),[[ids.file],[secondId]]);
  assert.equal(selection.totalBytes,55_000_000);
  assert.equal(selection.excluded.get(thirdId),'file_too_large');
  assert.ok(selection.batches.every(batch=>batch.reduce((total,item)=>total+item.sizeBytes,0)<OPENAI_FILE_INPUT_LIMIT_BYTES));

  const exactBoundary=partitionOpenAiInputFiles([
    {...file,sizeBytes:30_000_000},
    {...file,id:secondId,sizeBytes:20_000_000},
  ]);
  assert.deepEqual(exactBoundary.batches.map(batch=>batch.length),[1,1]);

  const tiny=partitionOpenAiInputFiles(Array.from({length:20},(_,index)=>({
    ...file,id:`40000000-0000-4000-8000-${String(index+100).padStart(12,'0')}`,sizeBytes:1024,
  })));
  assert.deepEqual(tiny.batches.map(batch=>batch.length),[OPENAI_FILES_PER_REQUEST,OPENAI_FILES_PER_REQUEST,4]);
});

test('provider batch merge covers every intake file once and never files an unsupported source',()=>{
  const secondId='40000000-0000-4000-8000-000000000014';
  const second={...file,id:secondId,name:'survey.geojson',mediaType:'application/geo+json',sizeBytes:512};
  const organize=intakeInstructionSchema.parse({id:ids.intake,scopeId:ids.scope,files:[file,second],outcome:'organize'});
  const provider=openAiIntelligencePlanSchema.parse({
    version:1,intakeId:ids.intake,scopeId:ids.scope,
    documents:[{
      fileId:ids.file,sourceSha256:digest,
      classification:{kind:'drill_log',confidence:0.9,rationale:'Drilling observations.',provenance:[{...source,locator:null}],warnings:[]},
      mapping:null,patches:[],confidence:0.9,warnings:[],
    }],
    confidence:0.9,summary:'One readable source was classified.',warnings:[],
  });
  const merged=mergeOpenAiBatchPlans(
    organize,[openAiPlanToDomain(provider)],new Map([[secondId,'unsupported_format' as const]]),
  );
  assert.ok(merged);
  assert.deepEqual(merged.documents.map(document=>document.fileId),[ids.file,secondId]);
  assert.equal(new Set(merged.documents.map(document=>document.fileId)).size,2);
  assert.equal(merged.documents[1].mapping,null);
  assert.deepEqual(merged.documents[1].patches,[]);
  assert.ok(merged.documents[1].classification.warnings.some(warning=>warning.code==='unsupported_format'));
  assert.equal(intelligencePlanSchema.safeParse({...merged,generation:{kind:'model',provider:'test',model:'test',promptVersion:'test'}}).success,true);
});

test('intake instructions enforce scope, uniqueness and versioned change targets',()=>{
  assert.equal(intakeInstructionSchema.safeParse({...instruction,files:[file,{...file}]}).success,false);
  assert.equal(intakeInstructionSchema.safeParse({...instruction,files:[{...file,scopeId:ids.otherScope}]}).success,false);
  assert.equal(intakeInstructionSchema.safeParse({...instruction,targetRecord:undefined}).success,false);
  assert.equal(intakeInstructionSchema.safeParse({...instruction,targetRecord:{...target,scopeId:ids.otherScope}}).success,false);
});

test('valid model output remains proposal-only and every write requires approval',()=>{
  const review=reviewIntelligencePlan(instruction,plan(),catalog);
  assert.equal(review.valid,true);
  assert.equal(review.proposalOnly,true);
  assert.equal(review.state,'review_required');
  assert.equal(review.approval,'human');
  assert.equal(review.risk,'medium');
  assert.equal(review.violations.length,0);
});

test('policy blocks unknown actions, immutable paths and unverified sources',()=>{
  const unknown=plan();
  unknown.documents[0].mapping!.target.action='geo.sample.unregistered';
  let review=reviewIntelligencePlan(instruction,unknown,catalog);
  assert.equal(review.state,'blocked');
  assert.equal(review.approval,'prohibited');
  assert.ok(review.violations.some(issue=>issue.code==='catalog_action_unknown'));

  const immutablePlan=plan();
  immutablePlan.documents[0].mapping!.fields[0].targetPath='/scopeId';
  immutablePlan.documents[0].patches[0].path='/scopeId';
  review=reviewIntelligencePlan(instruction,immutablePlan,[{...catalog[0],allowedPatchPrefixes:['/scopeId']}]);
  assert.ok(review.violations.some(issue=>issue.code==='immutable_path'));
  assert.equal(review.approval,'prohibited');

  const quarantinedInstruction=intakeInstructionSchema.parse({...instruction,files:[{...file,trust:'quarantined'}]});
  review=reviewIntelligencePlan(quarantinedInstruction,plan(),catalog);
  assert.ok(review.violations.some(issue=>issue.code==='source_unverified'));
  assert.equal(review.state,'blocked');
});

test('policy never permits an invented existing-record target',()=>{
  const organize=intakeInstructionSchema.parse({
    id:ids.intake,scopeId:ids.scope,files:[file],outcome:'organize',preserveOriginal:true,
  });
  const review=reviewIntelligencePlan(organize,plan(),catalog);
  assert.equal(review.state,'blocked');
  assert.ok(review.violations.some(issue=>issue.code==='record_mismatch'));
});

test('field changes cannot cite a different document in the same intake',()=>{
  const secondId='40000000-0000-4000-8000-000000000014';
  const secondDigest='b'.repeat(64),secondFile={...file,id:secondId,sha256:secondDigest};
  const multiInstruction=intakeInstructionSchema.parse({...instruction,files:[file,secondFile]});
  const candidate=plan();
  const second=structuredClone(candidate.documents[0]);
  const secondSource={fileId:secondId,sha256:secondDigest};
  second.fileId=secondId;second.sourceSha256=secondDigest;
  second.classification.provenance=[secondSource];
  second.mapping!.fields[0].source=secondSource;
  second.patches[0].provenance=[secondSource];
  candidate.documents[0].mapping!.fields[0].source=secondSource;
  candidate.documents=[candidate.documents[0],second];
  const review=reviewIntelligencePlan(multiInstruction,candidate,catalog);
  assert.equal(review.state,'blocked');
  assert.ok(review.violations.some(issue=>issue.code==='provenance_mismatch'&&issue.documentIndex===0));
});

test('removal and sensitive operational changes deterministically require MFA review',()=>{
  const sensitive=plan();
  sensitive.documents[0].mapping!.fields=[{...sensitive.documents[0].mapping!.fields[0],targetPath:'/status'}];
  sensitive.documents[0].patches=[{op:'remove',path:'/status',confidence:0.9,rationale:'The source marks it absent.',provenance:[source]}];
  sensitive.documents[0].confidence=0.9;
  sensitive.confidence=0.9;
  const review=reviewIntelligencePlan(instruction,sensitive,[{...catalog[0],allowedPatchPrefixes:['/status']}]);
  assert.equal(review.valid,true);
  assert.equal(review.risk,'high');
  assert.equal(review.approval,'human_mfa');
});

test('aggregate confidence cannot exceed the least-confident cited field',()=>{
  const inflated=plan();
  inflated.documents[0].patches[0].confidence=0.6;
  const review=reviewIntelligencePlan(instruction,inflated,catalog);
  assert.equal(review.state,'blocked');
  assert.ok(review.violations.some(issue=>issue.code==='confidence_mismatch'));
});

test('engine accepts an injected provider only after strict parsing and trusted provenance injection',async()=>{
  const candidate=plan() as unknown as Record<string,unknown>;
  delete candidate.generation;
  const engine=createIntelligenceEngine({catalog,planner:{
    provenance:{kind:'model',provider:'injected-provider',model:'structured-planner',promptVersion:'2026-09-10'},
    async plan(){return candidate;},
  }});
  const result=await engine.plan(instruction);
  assert.equal(result.source,'planner');
  assert.equal(result.acceptedForReview,true);
  assert.equal(result.plan.generation.provider,'injected-provider');
  assert.equal(result.review.proposalOnly,true);
});

test('malformed or failed providers fall back deterministically without accepting writes',async()=>{
  const malformed=createIntelligenceEngine({catalog,planner:{
    provenance:{kind:'model',provider:'malformed',model:'test',promptVersion:'v1'},
    async plan(){return {...plan(),sql:'update mx_ops.samples set notes = null'};},
  }});
  const first=await malformed.plan(instruction);
  const second=await malformed.plan(instruction);
  assert.equal(first.source,'deterministic_fallback');
  assert.equal(first.failure,'planner_output_invalid');
  assert.equal(planningResultNeedsRetry(first),false);
  assert.equal(first.acceptedForReview,false);
  assert.deepEqual(first.plan,second.plan);
  assert.equal(first.plan.documents[0].mapping,null);
  assert.deepEqual(first.plan.documents[0].patches,[]);

  const failed=createIntelligenceEngine({catalog,planner:{
    provenance:{kind:'model',provider:'failed',model:'test',promptVersion:'v1'},
    async plan(){throw new Error('sensitive provider detail');},
  }});
  const failure=await failed.plan(instruction);
  assert.equal(failure.failure,'planner_unavailable');
  assert.equal(planningResultNeedsRetry(failure),true);
  assert.doesNotMatch(JSON.stringify(failure),/sensitive provider detail/);
  assert.equal(failure.review.state,'blocked');

  let intakeState:'received'|'proposed'='received';
  assert.throws(()=>{
    requirePersistablePlanningResult(failure);
    intakeState='proposed';
  },(error:unknown)=>error instanceof Error
    &&'code' in error&&error.code==='unavailable'
    &&!/sensitive provider detail/.test(error.message));
  assert.equal(intakeState,'received');

  requirePersistablePlanningResult(first);
  intakeState='proposed';
  assert.equal(intakeState,'proposed');
});

import {z} from 'zod';
import {
  actionNameSchema,
  decodeJsonPointer,
  type DocumentProposal,
  type FieldPatch,
  intelligencePlanSchema,
  type IntelligencePlan,
  intakeInstructionSchema,
  type IntakeInstruction,
  jsonPointerSchema,
  resourceKindSchema,
  type SourceProvenance,
} from './contracts';

export const INTELLIGENCE_POLICY_VERSION='2026-09-10.1';

export const riskLevelSchema=z.enum(['none','low','medium','high','critical']);
export type RiskLevel=z.infer<typeof riskLevelSchema>;
export const approvalRequirementSchema=z.enum(['none','human','human_mfa','prohibited']);
export type ApprovalRequirement=z.infer<typeof approvalRequirementSchema>;

export const intelligenceActionDefinitionSchema=z.object({
  action:actionNameSchema,
  resource:resourceKindSchema.exclude(['unknown']),
  schemaVersion:z.number().int().positive().max(10_000),
  operations:z.array(z.enum(['create','update','attach'])).min(1).max(3),
  permission:z.string().min(3).max(100).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/),
  baselineRisk:riskLevelSchema.exclude(['none']),
  requiresMfa:z.boolean(),
  aiPolicy:z.enum(['propose_only','disabled']),
  allowedPatchPrefixes:z.array(jsonPointerSchema).max(200),
  requiredPatchPaths:z.array(jsonPointerSchema).max(200).default([]),
}).strict().superRefine((value,context)=>{
  if(new Set(value.operations).size!==value.operations.length)context.addIssue({code:'custom',path:['operations'],message:'Operations must be unique.'});
  if(new Set(value.allowedPatchPrefixes).size!==value.allowedPatchPrefixes.length)context.addIssue({code:'custom',path:['allowedPatchPrefixes'],message:'Patch prefixes must be unique.'});
  if(new Set(value.requiredPatchPaths).size!==value.requiredPatchPaths.length)context.addIssue({code:'custom',path:['requiredPatchPaths'],message:'Required patch paths must be unique.'});
  for(const [index,path] of value.requiredPatchPaths.entries())if(!value.allowedPatchPrefixes.some(prefix=>withinPrefix(path,prefix))){
    context.addIssue({code:'custom',path:['requiredPatchPaths',index],message:'A required patch path must also be allowed.'});
  }
});
export type IntelligenceActionDefinition=z.infer<typeof intelligenceActionDefinitionSchema>;

export const intelligenceActionCatalogSchema=z.array(intelligenceActionDefinitionSchema).max(500).superRefine((value,context)=>{
  const actions=new Set<string>();
  for(const [index,definition] of value.entries()){
    if(actions.has(definition.action))context.addIssue({code:'custom',path:[index,'action'],message:'Action names must be unique.'});
    actions.add(definition.action);
  }
});
export type IntelligenceActionCatalog=z.infer<typeof intelligenceActionCatalogSchema>;

export type PlanViolationCode=
  |'catalog_action_disabled'|'catalog_action_unknown'|'catalog_mismatch'|'confidence_mismatch'|'duplicate_document'|'duplicate_mapping'
  |'duplicate_patch'|'immutable_path'|'intake_mismatch'|'operation_not_allowed'|'outcome_mismatch'
  |'patch_not_allowed'|'patch_required'|'patch_too_complex'|'provenance_mismatch'|'record_mismatch'|'source_unverified';
export type PlanViolation={code:PlanViolationCode;documentIndex?:number;path?:string;message:string};
export type DocumentPolicyDecision={
  fileId:string;
  state:'informational'|'review_required'|'blocked';
  risk:RiskLevel;
  approval:ApprovalRequirement;
  reasons:string[];
};
export type IntelligencePlanReview={
  valid:boolean;
  proposalOnly:true;
  policyVersion:string;
  state:'informational'|'review_required'|'blocked';
  risk:RiskLevel;
  approval:ApprovalRequirement;
  violations:PlanViolation[];
  documents:DocumentPolicyDecision[];
};

const immutableRoots=new Set([
  'id','scopeId','scope_id','version','expectedVersion','expected_version','requestId','request_id','createdAt','created_at',
  'createdBy','created_by','updatedAt','updated_at','updatedBy','updated_by','permissions','permission','role','audit','receipt',
]);
const sensitiveSegments=/(?:^|_)(?:amount|assay|balance|custody|fine|mass|owner|percent|quantity|state|status|weight)(?:$|_)/i;
const riskRank:Record<RiskLevel,number>={none:0,low:1,medium:2,high:3,critical:4};
const approvalRank:Record<ApprovalRequirement,number>={none:0,human:1,human_mfa:2,prohibited:3};

function maximumRisk(left:RiskLevel,right:RiskLevel):RiskLevel{return riskRank[left]>=riskRank[right]?left:right;}
function maximumApproval(left:ApprovalRequirement,right:ApprovalRequirement):ApprovalRequirement{return approvalRank[left]>=approvalRank[right]?left:right;}
function withinPrefix(path:string,prefix:string){return path===prefix||path.startsWith(prefix+'/');}
function topSegment(path:string){return decodeJsonPointer(path)[0];}
function isImmutable(path:string){return immutableRoots.has(topSegment(path));}
function isAllowed(path:string,definition:IntelligenceActionDefinition){return definition.allowedPatchPrefixes.some(prefix=>withinPrefix(path,prefix));}

function jsonShape(value:unknown,depth=0):{depth:number;nodes:number}{
  if(value===null||typeof value!=='object')return {depth,nodes:1};
  const children=Array.isArray(value)?value:Object.values(value);
  let deepest=depth,nodes=1;
  for(const child of children){const shape=jsonShape(child,depth+1);deepest=Math.max(deepest,shape.depth);nodes+=shape.nodes;}
  return {depth:deepest,nodes};
}

function allProvenance(document:DocumentProposal):SourceProvenance[]{
  return [
    ...document.classification.provenance,
    ...document.classification.warnings.flatMap(warning=>warning.provenance),
    ...(document.mapping?.fields.map(field=>field.source)??[]),
    ...(document.mapping?.warnings.flatMap(warning=>warning.provenance)??[]),
    ...document.patches.flatMap(patch=>patch.provenance),
    ...document.warnings.flatMap(warning=>warning.provenance),
  ];
}

function sameRecord(left:NonNullable<IntakeInstruction['targetRecord']>,right:NonNullable<DocumentProposal['mapping']>['target']['record']){
  return !!right&&left.scopeId===right.scopeId&&left.resource===right.resource&&left.id===right.id&&left.expectedVersion===right.expectedVersion;
}

function inspectPatchComplexity(patch:FieldPatch){
  if(patch.op==='remove')return false;
  const shape=jsonShape(patch.value);
  return shape.depth>12||shape.nodes>5000||JSON.stringify(patch.value).length>100_000;
}

export function reviewIntelligencePlan(instructionInput:unknown,planInput:unknown,catalogInput:unknown):IntelligencePlanReview{
  const instruction:IntakeInstruction=intakeInstructionSchema.parse(instructionInput);
  const plan:IntelligencePlan=intelligencePlanSchema.parse(planInput);
  const catalog:IntelligenceActionCatalog=intelligenceActionCatalogSchema.parse(catalogInput);
  const violations:PlanViolation[]=[];
  const add=(violation:PlanViolation)=>violations.push(violation);
  const files=new Map(instruction.files.map(file=>[file.id,file]));
  const catalogByAction=new Map(catalog.map(definition=>[definition.action,definition]));
  const seenDocuments=new Set<string>();

  if(plan.intakeId!==instruction.id)add({code:'intake_mismatch',message:'The proposal does not identify the requested intake.'});
  if(plan.scopeId!==instruction.scopeId)add({code:'intake_mismatch',message:'The proposal scope does not match the requested intake.'});
  if(plan.documents.length!==instruction.files.length)add({code:'intake_mismatch',message:'The proposal must include exactly one result for every intake file.'});
  for(const warning of plan.warnings)for(const source of warning.provenance){
    const cited=files.get(source.fileId);
    if(!cited||cited.sha256!==source.sha256)add({code:'provenance_mismatch',message:'Plan warning provenance must resolve to an intake file with the same digest.'});
  }

  const decisions=plan.documents.map((document,documentIndex):DocumentPolicyDecision=>{
    const reasons:string[]=[];
    let risk:RiskLevel='none';
    let blocked=false;
    const file=files.get(document.fileId);
    if(seenDocuments.has(document.fileId)){add({code:'duplicate_document',documentIndex,message:'A file may be proposed only once.'});blocked=true;}
    seenDocuments.add(document.fileId);
    if(!file||file.sha256!==document.sourceSha256){add({code:'intake_mismatch',documentIndex,message:'The proposal file identity does not match the intake.'});blocked=true;}

    const citedConfidence=Math.min(
      document.classification.confidence,
      document.mapping?.confidence??1,
      ...(document.mapping?.fields.map(field=>field.confidence)??[1]),
      ...document.patches.map(patch=>patch.confidence),
    );
    if(document.confidence>citedConfidence){add({code:'confidence_mismatch',documentIndex,message:'Document confidence cannot exceed its least-confident cited classification, mapping or patch.'});blocked=true;}

    if(!document.classification.provenance.some(source=>source.fileId===document.fileId&&source.sha256===document.sourceSha256)){
      add({code:'provenance_mismatch',documentIndex,message:'The classification must cite its source file and digest.'});blocked=true;
    }
    for(const source of allProvenance(document)){
      const cited=files.get(source.fileId);
      if(!cited||cited.sha256!==source.sha256){add({code:'provenance_mismatch',documentIndex,message:'Proposal provenance must resolve to an intake file with the same digest.'});blocked=true;break;}
    }
    const mutationProvenance=[
      ...(document.mapping?.fields.map(field=>field.source)??[]),
      ...document.patches.flatMap(patch=>patch.provenance),
    ];
    if(mutationProvenance.some(source=>source.fileId!==document.fileId||source.sha256!==document.sourceSha256)){
      add({code:'provenance_mismatch',documentIndex,message:'Every mapped or changed field must cite the document it would publish.'});
      blocked=true;
    }

    const blockingWarnings=[...document.classification.warnings,...(document.mapping?.warnings??[]),...document.warnings].filter(warning=>warning.blocksAutomation||warning.severity==='error');
    if(blockingWarnings.length){blocked=true;risk=maximumRisk(risk,'high');reasons.push('Resolve blocking extraction warnings.');}
    if(document.confidence<0.5||document.classification.confidence<0.5){risk=maximumRisk(risk,'high');reasons.push('Low-confidence content needs explicit human resolution.');}
    else if(document.confidence<0.8||document.classification.confidence<0.8){risk=maximumRisk(risk,'medium');reasons.push('Review the proposal confidence and source evidence.');}

    if(instruction.outcome==='classify'&&(document.mapping!==null||document.patches.length)){
      add({code:'outcome_mismatch',documentIndex,message:'A classification-only intake cannot propose a destination or patches.'});blocked=true;
    }
    if(instruction.outcome==='propose_record_changes'&&document.mapping?.target.operation!=='update'){
      add({code:'outcome_mismatch',documentIndex,message:'Existing-record changes must use an update proposal.'});blocked=true;
    }

    const mapping=document.mapping;
    if(mapping){
      risk=maximumRisk(risk,'low');
      if(mapping.target.operation!=='create'&&!instruction.targetRecord){
        add({code:'record_mismatch',documentIndex,message:'An existing record may be changed only when the caller supplied its versioned identity.'});
        blocked=true;
      }
      const definition=catalogByAction.get(mapping.target.action);
      if(!definition){add({code:'catalog_action_unknown',documentIndex,message:'The proposal action is not registered in the trusted catalog.'});blocked=true;}
      else{
        risk=maximumRisk(risk,definition.baselineRisk);
        if(definition.aiPolicy==='disabled'){add({code:'catalog_action_disabled',documentIndex,message:'The trusted catalog does not allow AI proposals for this action.'});blocked=true;}
        if(definition.resource!==mapping.target.resource||definition.schemaVersion!==mapping.target.schemaVersion){add({code:'catalog_mismatch',documentIndex,message:'The proposal target does not match its trusted action definition.'});blocked=true;}
        if(!definition.operations.includes(mapping.target.operation)){add({code:'operation_not_allowed',documentIndex,message:'The action does not allow the proposed operation.'});blocked=true;}
        if(instruction.destinationHint&&(instruction.destinationHint.resource!==mapping.target.resource||(instruction.destinationHint.action&&instruction.destinationHint.action!==mapping.target.action))){add({code:'catalog_mismatch',documentIndex,message:'The proposal conflicts with the caller-provided destination hint.'});blocked=true;}
        if(instruction.targetRecord&&!sameRecord(instruction.targetRecord,mapping.target.record)){add({code:'record_mismatch',documentIndex,message:'The proposal changed the explicit target identity or expected version.'});blocked=true;}
        if(mapping.target.record?.scopeId!==undefined&&mapping.target.record.scopeId!==instruction.scopeId){add({code:'record_mismatch',documentIndex,message:'The proposal target belongs to a different scope.'});blocked=true;}

        const mappingPaths=new Set<string>();
        for(const field of mapping.fields){
          if(mappingPaths.has(field.targetPath)){add({code:'duplicate_mapping',documentIndex,path:field.targetPath,message:'Each target field may be mapped only once.'});blocked=true;}
          mappingPaths.add(field.targetPath);
          if(isImmutable(field.targetPath)){add({code:'immutable_path',documentIndex,path:field.targetPath,message:'Identity, scope, version and audit fields are never AI-mappable.'});blocked=true;}
          else if(!isAllowed(field.targetPath,definition)){add({code:'patch_not_allowed',documentIndex,path:field.targetPath,message:'The target field is not allowed by the trusted action definition.'});blocked=true;}
        }
        const patchPaths=new Set<string>();
        for(const patch of document.patches){
          if(patchPaths.has(patch.path)){add({code:'duplicate_patch',documentIndex,path:patch.path,message:'Each field may be patched only once.'});blocked=true;}
          patchPaths.add(patch.path);
          if(isImmutable(patch.path)){add({code:'immutable_path',documentIndex,path:patch.path,message:'Identity, scope, version and audit fields are never AI-editable.'});blocked=true;}
          else if(!isAllowed(patch.path,definition)){add({code:'patch_not_allowed',documentIndex,path:patch.path,message:'The field is not allowed by the trusted action definition.'});blocked=true;}
          if(inspectPatchComplexity(patch)){add({code:'patch_too_complex',documentIndex,path:patch.path,message:'A field patch exceeded the bounded JSON complexity.'});blocked=true;}
          if(patch.op==='remove'){risk=maximumRisk(risk,'high');reasons.push('Removal proposals require elevated review.');}
          if(decodeJsonPointer(patch.path).some(segment=>sensitiveSegments.test(segment))){risk=maximumRisk(risk,'high');reasons.push('A sensitive operational field is affected.');}
        }
        for(const path of definition.requiredPatchPaths)if(!patchPaths.has(path)){
          add({code:'patch_required',documentIndex,path,message:'The trusted action requires an explicit, reviewable value for this field.'});
          blocked=true;
        }
        if(file?.trust==='quarantined'){
          add({code:'source_unverified',documentIndex,message:'A quarantined source cannot support a record-changing proposal.'});
          blocked=true;
        }
        if(definition.requiresMfa)reasons.push('The registered action requires MFA.');
      }
    }else if(document.patches.length){
      blocked=true;
    }

    if(blocked)return {fileId:document.fileId,state:'blocked',risk:maximumRisk(risk,'high'),approval:'prohibited',reasons:[...new Set(reasons.length?reasons:['Resolve proposal policy violations.'])]};
    if(!mapping)return {fileId:document.fileId,state:'informational',risk,approval:'none',reasons:[...new Set(reasons)]};
    const definition=catalogByAction.get(mapping.target.action)!;
    const approval:ApprovalRequirement=definition.requiresMfa||riskRank[risk]>=riskRank.high?'human_mfa':'human';
    return {fileId:document.fileId,state:'review_required',risk,approval,reasons:[...new Set([...reasons,'A human must approve every AI-generated write proposal.'])]};
  });

  for(const file of instruction.files)if(!seenDocuments.has(file.id))add({code:'intake_mismatch',message:`No proposal was returned for file ${file.id}.`});
  if(plan.confidence>Math.min(...plan.documents.map(document=>document.confidence)))add({code:'confidence_mismatch',message:'Plan confidence cannot exceed its least-confident document.'});
  const valid=violations.length===0;
  let state:IntelligencePlanReview['state']='informational',risk:RiskLevel='none',approval:ApprovalRequirement='none';
  for(const decision of decisions){
    risk=maximumRisk(risk,decision.risk);
    approval=maximumApproval(approval,decision.approval);
    if(decision.state==='blocked')state='blocked';
    else if(decision.state==='review_required'&&state!=='blocked')state='review_required';
  }
  if(plan.warnings.some(warning=>warning.blocksAutomation||warning.severity==='error')){
    state='blocked';risk=maximumRisk(risk,'high');approval='prohibited';
  }
  if(!valid){state='blocked';risk=maximumRisk(risk,'high');approval='prohibited';}
  return {valid,proposalOnly:true,policyVersion:INTELLIGENCE_POLICY_VERSION,state,risk,approval,violations,documents:decisions};
}

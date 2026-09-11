import {
  INTELLIGENCE_CONTRACT_VERSION,
  generationProvenanceSchema,
  intelligencePlanSchema,
  intakeInstructionSchema,
  type DocumentProposal,
  type GenerationProvenance,
  type IntelligencePlan,
  type IntakeInstruction,
  type ProposalWarning,
} from './contracts';
import {
  intelligenceActionCatalogSchema,
  reviewIntelligencePlan,
  type IntelligenceActionCatalog,
  type IntelligencePlanReview,
} from './policy';

export interface IntelligencePlanner{
  /** Adapter-owned metadata. The engine does not trust a model to self-report its provenance. */
  provenance:GenerationProvenance;
  plan(instruction:IntakeInstruction):Promise<unknown>;
}

export type PlanningFailure='planner_unavailable'|'planner_output_invalid';
export type IntelligencePlanningResult={
  source:'planner'|'deterministic_fallback';
  acceptedForReview:boolean;
  failure?:PlanningFailure;
  plan:IntelligencePlan;
  review:IntelligencePlanReview;
};

export type IntelligenceEngine={
  /** Produces proposals only. This domain object deliberately has no execute or persistence method. */
  plan(input:unknown):Promise<IntelligencePlanningResult>;
};

/** Transient planner failure must not consume the one-way received→proposed
 * transition. The caller can safely retry while malformed completed output is
 * retained as a blocked, reviewable result. */
export function planningResultNeedsRetry(result:IntelligencePlanningResult){
  return result.failure==='planner_unavailable';
}

const fallbackGeneration:GenerationProvenance={
  kind:'deterministic',provider:'mineralx',model:'metadata-classifier',promptVersion:'fallback-v1',
};

function fallbackClassification(file:IntakeInstruction['files'][number]){
  const name=file.name.toLowerCase();
  if(/(?:meeting|minutes|actions?)[._ -]/.test(name)||/(?:meeting|minutes)/.test(name))return {kind:'meeting_notes' as const,confidence:0.45,rationale:'The file name indicates meeting notes; content has not been interpreted.'};
  if(/(?:assay|certificate|coa|lab)[._ -]/.test(name))return {kind:'assay_certificate' as const,confidence:0.45,rationale:'The file name indicates a laboratory or assay certificate; content has not been interpreted.'};
  if(/(?:drill|collar|hole|geology)[._ -]/.test(name))return {kind:'drill_log' as const,confidence:0.4,rationale:'The file name indicates drilling or geological observations; content has not been interpreted.'};
  if(/(?:dispatch|manifest)[._ -]/.test(name))return {kind:'sample_dispatch' as const,confidence:0.4,rationale:'The file name indicates a dispatch or manifest; content has not been interpreted.'};
  if(file.mediaType==='text/csv'||/\.(?:csv|xlsx?|ods)$/.test(name))return {kind:'spreadsheet' as const,confidence:0.35,rationale:'The media type or extension identifies tabular content; its business meaning remains unknown.'};
  if(file.mediaType.startsWith('image/'))return {kind:'image' as const,confidence:0.4,rationale:'The media type identifies an image; its business meaning remains unknown.'};
  if(file.mediaType==='application/pdf')return {kind:'report' as const,confidence:0.25,rationale:'The media type identifies a PDF; its business meaning remains unknown.'};
  return {kind:'unknown' as const,confidence:0.1,rationale:'Metadata alone is insufficient to classify this file.'};
}

function fallbackWarning(instruction:IntakeInstruction,file:IntakeInstruction['files'][number]):ProposalWarning{
  return {
    code:'manual_review_required',severity:'warning',
    message:'No trusted planner result is available. Review the original before selecting a destination or changing a record.',
    blocksAutomation:instruction.outcome!=='classify',
    provenance:[{fileId:file.id,sha256:file.sha256}],
  };
}

export function deterministicFallbackPlan(instruction:IntakeInstruction,failure?:PlanningFailure):IntelligencePlan{
  const documents:DocumentProposal[]=instruction.files.map(file=>{
    const classification=fallbackClassification(file);
    const warning=fallbackWarning(instruction,file);
    return {
      fileId:file.id,
      sourceSha256:file.sha256,
      classification:{...classification,provenance:[{fileId:file.id,sha256:file.sha256}],warnings:[warning]},
      mapping:null,
      patches:[],
      confidence:classification.confidence,
      warnings:[],
    };
  });
  const warnings:ProposalWarning[]=failure?[{
    code:failure==='planner_unavailable'?'provider_failure':'provider_output_invalid',
    severity:'error',
    message:failure==='planner_unavailable'?'The configured planner was unavailable; no AI-generated changes were accepted.':'The planner response failed its strict contract; no AI-generated changes were accepted.',
    blocksAutomation:true,
    provenance:[],
  }]:[];
  return {
    version:INTELLIGENCE_CONTRACT_VERSION,
    intakeId:instruction.id,
    scopeId:instruction.scopeId,
    generation:fallbackGeneration,
    documents,
    confidence:Math.min(...documents.map(document=>document.confidence)),
    summary:'Metadata-only classification. No destination or record changes have been proposed.',
    warnings,
  };
}

function withTrustedGeneration(raw:unknown,generation:GenerationProvenance):unknown{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
  return {...raw,generation};
}

export function createIntelligenceEngine(configuration:{catalog:unknown;planner?:IntelligencePlanner}):IntelligenceEngine{
  const catalog:IntelligenceActionCatalog=intelligenceActionCatalogSchema.parse(configuration.catalog);
  const planner=configuration.planner;
  const plannerProvenance=planner?generationProvenanceSchema.parse(planner.provenance):undefined;
  if(plannerProvenance?.kind==='deterministic')throw new Error('Injected planners must identify model-backed generation; use the built-in deterministic fallback otherwise.');

  return {
    async plan(input:unknown){
      const instruction=intakeInstructionSchema.parse(input);
      if(!planner){
        const plan=deterministicFallbackPlan(instruction);
        const review=reviewIntelligencePlan(instruction,plan,catalog);
        return {source:'deterministic_fallback',acceptedForReview:review.valid&&review.state!=='blocked',plan,review};
      }
      let raw:unknown;
      try{raw=await planner.plan(instruction);}
      catch{
        const plan=deterministicFallbackPlan(instruction,'planner_unavailable');
        const review=reviewIntelligencePlan(instruction,plan,catalog);
        return {source:'deterministic_fallback',acceptedForReview:false,failure:'planner_unavailable',plan,review};
      }
      const parsed=intelligencePlanSchema.safeParse(withTrustedGeneration(raw,plannerProvenance!));
      if(!parsed.success){
        const plan=deterministicFallbackPlan(instruction,'planner_output_invalid');
        const review=reviewIntelligencePlan(instruction,plan,catalog);
        return {source:'deterministic_fallback',acceptedForReview:false,failure:'planner_output_invalid',plan,review};
      }
      const review=reviewIntelligencePlan(instruction,parsed.data,catalog);
      return {source:'planner',acceptedForReview:review.valid&&review.state!=='blocked',plan:parsed.data,review};
    },
  };
}

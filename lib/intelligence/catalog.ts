import type {DocumentProposal} from './contracts';
import type {IntelligenceActionCatalog} from './policy';

/**
 * AI never expands this catalogue. Every entry is a server-owned adapter to an
 * existing MineralX command, its permission and its permitted payload fields.
 */
export const MINERALX_INTELLIGENCE_ACTIONS = [
  {
    action: 'document.publish',
    resource: 'document',
    schemaVersion: 1,
    operations: ['create'],
    permission: 'work.write',
    baselineRisk: 'low',
    requiresMfa: true,
    aiPolicy: 'propose_only',
    allowedPatchPrefixes: ['/title', '/category'],
    requiredPatchPaths: ['/title','/category'],
  },
] satisfies IntelligenceActionCatalog;

export const documentCategories = [
  'procedure','plan','handover','certificate','decision','other',
] as const;

/** Maps the richer intelligence classification onto the existing, governed
 * mx_ops.documents category constraint. This adapter, not the model, owns the
 * storage vocabulary. */
export function documentStorageCategory(kind:DocumentProposal['classification']['kind']):typeof documentCategories[number]{
  if(kind==='assay_certificate')return 'certificate';
  if(kind==='procedure_or_plan')return 'plan';
  if(kind==='operational_log')return 'handover';
  return 'other';
}

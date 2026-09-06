// Shared identity and provenance rules. Stored identifiers retain the user's spelling.
export const idKey = value => String(value ?? '').normalize('NFC').trim().toUpperCase();
export const isControl = sample => !!sample?.qaqcType && sample.qaqcType !== 'none';
export const isReferenceControl = sample => ['blank','standard'].includes(sample?.qaqcType);
export const hasReleasedAssays = sample => sample?.assayReviewStatus === 'released' || (!sample?.assayReviewStatus && !!sample?.assayHistory?.some(h=>h.reviewedAt));
export const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function finiteInput(value,label) {
  if(value === '' || value == null || typeof value==='boolean' || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number.`);
  return Number(value);
}
export function appendAudit(project, action, recordId, reason) {
  return [...(project.audit||[]), {recordId:globalThis.crypto.randomUUID(),action,entityRecordId:recordId,reason,at:new Date().toISOString()}];
}

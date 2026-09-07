import { z } from 'zod';

export const OPS_RELEASE = '2026.09.07.5';
export const OPS_SCHEMA = 5;
export const permissionProfiles = {
  collector: ['geo.read', 'geo.capture', 'files.geo', 'work.read', 'work.write'],
  geologist: ['geo.read', 'geo.capture', 'geo.publish', 'files.geo', 'work.read', 'work.write'],
  lab_reviewer: ['geo.read', 'geo.capture', 'lab.review', 'files.geo', 'work.read', 'work.write'],
  operator: ['plant.read', 'plant.capture', 'gold.read', 'gold.capture', 'files.plant', 'files.gold', 'work.read', 'work.write'],
  supervisor: ['plant.read', 'plant.capture', 'plant.review', 'gold.read', 'gold.capture', 'gold.review', 'balance.prepare', 'balance.read', 'files.plant', 'files.gold', 'work.read', 'work.write'],
  custodian: ['gold.read', 'gold.custody', 'gold.custody.read', 'files.custody', 'files.gold', 'work.read', 'work.write'],
  accountant: ['commercial.read', 'commercial.write', 'plant.read', 'gold.read', 'balance.read', 'balance.prepare', 'balance.close', 'report.read', 'report.export', 'files.plant', 'files.gold', 'work.read', 'work.write'],
  manager: ['commercial.read', 'plant.read', 'gold.read', 'geo.read', 'balance.read', 'report.read', 'report.export', 'work.read'],
  auditor: ['commercial.read', 'plant.read', 'gold.read', 'geo.read', 'balance.read', 'report.read', 'report.export', 'audit.read', 'work.read'],
} as const;
export type Profile = keyof typeof permissionProfiles;
export type ScopeKind = 'project' | 'facility' | 'reporting';
export type Scope = { id: string; org_id: string; name: string; code: string; kind: ScopeKind; timezone: string; permissions: string[]; version: number; policy: Record<string, unknown> };
export type OpsContext = { userId: string; schemaVersion: number; scopes: Scope[]; organisations: {id:string;name:string;admin:boolean}[]; aal: string; asOf: string };
export const commandSchema = z.object({
  scopeId: z.string().uuid(), requestId: z.string().uuid(), id: z.string().uuid(),
  expectedVersion: z.number().int().min(0).max(2147483646), action: z.string().min(3).max(80),
  payload: z.record(z.string(), z.unknown()), expectedActorId: z.string().uuid().optional(),
}).strict();
export type Command = z.infer<typeof commandSchema>;
export type CommandResult = { id: string; version: number; revision: number; action: string; record: Record<string, unknown>; replayed?: boolean };
export type OpsFailureCode = 'unauthenticated'|'forbidden'|'mfa_required'|'conflict'|'validation'|'unavailable'|'not_found';
export class OpsError extends Error {
  constructor(public code: OpsFailureCode, message: string, public requestId?: string) { super(message); this.name='OpsError'; }
}
export function permits(scope: Scope | undefined, permission: string) { return !!scope?.permissions.includes(permission); }
export function safeOpsPath(input: unknown, fallback='/ops') {
  if (typeof input !== 'string' || input.length>500 || /[\\\r\n]/.test(input)) return fallback;
  try { const u=new URL(input,'https://mineral-x.com.au');return u.origin==='https://mineral-x.com.au'&&(u.pathname==='/ops'||u.pathname.startsWith('/ops/'))?u.pathname+u.search:fallback; } catch {return fallback;}
}
export function classifyDatabaseError(error: {code?:string;message?:string}): OpsError {
  const text=error.message||'';
  if(text.includes('MFA_REQUIRED'))return new OpsError('mfa_required','Verify your authenticator before this accountable action.');
  if(text.includes('ACCESS_DENIED')||error.code==='42501')return new OpsError('forbidden','Your current access does not permit this action in this workspace.');
  if(text.includes('CONFLICT')||text.includes('IDEMPOTENCY_MISMATCH'))return new OpsError('conflict','This record or request changed. Your entry is retained; compare the current version before retrying.');
  if(text.includes('NOT_FOUND'))return new OpsError('not_found','This record is not available in your workspace.');
  if(text.startsWith('RULE:'))return new OpsError('validation',text.slice(5).trim());
  if(error.code==='23505')return new OpsError('validation','That identifier already exists in this workspace. Review the existing record.');
  if(['23514','23503','22007','22P02','22003'].includes(error.code||''))return new OpsError('validation','Check required values, units, dates and linked records. Nothing was committed.');
  return new OpsError('unavailable','The operation could not be confirmed. Keep your entry and retry with the same request.');
}
export function statusFor(error: OpsError) { return ({unauthenticated:401,forbidden:403,mfa_required:403,conflict:409,validation:422,unavailable:503,not_found:404})[error.code]; }
export function csvCell(value: unknown) { const text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);return '"'+(/^[\s]*[=+@\-]/.test(text)?"'"+text:text).replaceAll('"','""')+'"'; }
export function rowsToCsv(rows: Record<string,unknown>[], fields: string[]) {return [fields.map(csvCell).join(','),...rows.map(row=>fields.map(field=>csvCell(row[field])).join(','))].join('\r\n')+'\r\n';}

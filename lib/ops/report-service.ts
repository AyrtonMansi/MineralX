import 'server-only';

import {OpsError, type Scope} from './contracts';
import {rpc as callRpc, type OperationsRpcClient} from './server';
import {
  buildReportDocument,
  normaliseReportPeriod,
  reportCatalogForScope,
  REPORTING_SCHEMA,
  type ReportId,
} from './reporting-core';

export function reportCatalogue(scope: Scope) {
  return {schema: REPORTING_SCHEMA, definitions: reportCatalogForScope(scope)};
}
export async function listReportRuns(db: OperationsRpcClient, scopeId: string, after: string | null = null, limit = 50) {
  return callRpc(db, 'mx_ops_report_run_list', {p_scope: scopeId, p_after: after, p_limit: limit});
}

export async function readReportRun(db: OperationsRpcClient, scopeId: string, runId: string) {
  return callRpc(db, 'mx_ops_report_run_read', {p_scope: scopeId, p_id: runId});
}

export async function generateReportRun({
  db,
  scope,
  reportId,
  from,
  to,
  requestId,
}: {
  db: OperationsRpcClient;
  scope: Scope;
  reportId: ReportId;
  from?: string | null;
  to?: string | null;
  requestId: string;
}) {
  if (!scope.permissions.includes('report.generate')) throw new OpsError('forbidden', 'Report generation is not assigned to this account.');
  const period = normaliseReportPeriod(from, to);
  const document = await buildReportDocument({
    call: (name, args) => callRpc(db, name, args),
    scope,
    reportId,
    ...period,
  });
  return callRpc(db, 'mx_ops_report_run_create', {
    p_scope: scope.id,
    p_request: requestId,
    p_id: crypto.randomUUID(),
    p_report_id: reportId,
    p_report_version: document.reportVersion,
    p_from: period.from,
    p_to: period.to,
    p_source_revision: document.source.revision ?? 0,
    p_status: document.status,
    p_document: document,
    p_metrics: document.metrics,
    p_gaps: document.readiness.blockers,
  });
}

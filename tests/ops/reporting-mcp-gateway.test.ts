import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup, ids, asUser} from './helpers';

let db: Awaited<ReturnType<typeof setup>>;

async function migration(name: string) {
  await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}

async function gateway(operation: string, args: Record<string, unknown>) {
  return (await asUser(db, ids.manager, 'select public.mx_ops_mcp_gateway($1,$2,$3,$4,$5::jsonb) result', [
    ids.manager, 'report-test-client', 'aal1', operation, JSON.stringify(args),
  ], 'aal1', 'service_role', 'report-test-client'))[0].result;
}

test('the protected MCP gateway exposes only the governed report run operations', async () => {
  db = await setup();
  try {
    for (const name of [
      '20260909020000_operations_workflow.sql',
      '20260910010000_operations_processing_program_choices.sql',
      '20260910020000_operations_closed_campaign_backfill.sql',
      '20260910022510_operations_intelligence_intakes.sql',
      '20260912050000_engineering_design_changesets.sql',
      '20260914010816_operations_reporting_foundation.sql',
      '20260914011746_operations_reporting_mcp_gateway.sql',
    ]) await migration(name);

    const runId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const created = await gateway('mx_ops_report_run_create', {
      p_scope: ids.facility, p_request: requestId, p_id: runId, p_report_id: 'RPT-13', p_report_version: 1,
      p_from: '2026-09-01T00:00:00Z', p_to: '2026-09-08T00:00:00Z', p_source_revision: 0, p_status: 'ready',
      p_document: {format: 'mineralx-report-v1', reportId: 'RPT-13'}, p_metrics: [], p_gaps: [],
    });
    assert.equal(created.id, runId);
    const read = await gateway('mx_ops_report_run_read', {p_scope: ids.facility, p_id: runId});
    assert.equal(read.document.reportId, 'RPT-13');
    const listed = await gateway('mx_ops_report_run_list', {p_scope: ids.facility, p_after: null, p_limit: 10});
    assert.equal(listed.rows[0].id, runId);
    await assert.rejects(gateway('mx_ops_report_run_delete', {p_scope: ids.facility, p_id: runId}), /Unknown MCP gateway operation|report/);
  } finally {
    await db.close();
  }
});

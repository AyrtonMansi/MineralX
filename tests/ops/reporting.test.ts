import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup, ids, asUser} from './helpers';
import {REPORT_DEFINITIONS, reportCatalogForScope} from '../../lib/ops/reporting-core';

test('the fundamental report catalogue is complete and fails closed for missing registers', () => {
  assert.equal(REPORT_DEFINITIONS.length, 14);
  assert.deepEqual(REPORT_DEFINITIONS.map((definition) => definition.id), [
    'RPT-01', 'RPT-02', 'RPT-03', 'RPT-04', 'RPT-05', 'RPT-06', 'RPT-07',
    'RPT-08', 'RPT-09', 'RPT-10', 'RPT-11', 'RPT-12', 'RPT-13', 'RPT-14',
  ]);
  const catalogue = reportCatalogForScope({permissions: ['report.read', 'report.generate', 'geo.read']});
  assert.equal(catalogue.find((definition) => definition.id === 'RPT-07')?.readiness.canGenerate, true);
  assert.equal(catalogue.find((definition) => definition.id === 'RPT-04')?.readiness.status, 'partial');
  assert.equal(catalogue.find((definition) => definition.id === 'RPT-08')?.readiness.canGenerate, false);
  assert.match(catalogue.find((definition) => definition.id === 'RPT-08')?.readiness.blockers.join(' ') || '', /not configured/i);
});

test('report runs retain the document, source revision and audit boundary', async () => {
  const db = await setup();
  try {
    await db.exec(await readFile(new URL('../../supabase/migrations/20260914010816_operations_reporting_foundation.sql', import.meta.url), 'utf8'));
    const runId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const document = {format: 'mineralx-report-v1', reportId: 'RPT-07', status: 'ready', source: {revision: 4}};
    const metrics = [{id: 'runs', value: 2, unit: 'count'}];
    const create = (await asUser(db, ids.manager,
      'select public.mx_ops_report_run_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) result',
      [ids.facility, requestId, runId, 'RPT-07', 1, '2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z', 4, 'ready', JSON.stringify(document), JSON.stringify(metrics), '[]'],
    ))[0].result;
    assert.equal(create.id, runId);
    assert.equal(create.source_revision, 4);
    assert.equal(create.document.reportId, 'RPT-07');

    const read = (await asUser(db, ids.manager, 'select public.mx_ops_report_run_read($1,$2) result', [ids.facility, runId]))[0].result;
    assert.equal(read.document.source.revision, 4);
    const listed = (await asUser(db, ids.manager, 'select public.mx_ops_report_run_list($1,null,50) result', [ids.facility]))[0].result;
    assert.equal(listed.rows.length, 1);
    assert.equal(listed.rows[0].id, runId);
    await assert.rejects(asUser(db, ids.operator,
      'select public.mx_ops_report_run_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) result',
      [ids.facility, crypto.randomUUID(), crypto.randomUUID(), 'RPT-07', 1, '2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z', 4, 'ready', JSON.stringify(document), JSON.stringify(metrics), '[]'],
    ), /ACCESS_DENIED|permission denied/);
  } finally {
    await db.close();
  }
});

test('MCP exposes report catalogue, readiness, generation and retrieval tools', async () => {
  const source = await readFile(new URL('../../lib/mcp/server.ts', import.meta.url), 'utf8');
  for (const name of ['get_mineralx_report_catalog', 'check_mineralx_report_readiness', 'generate_mineralx_report', 'list_mineralx_reports', 'get_mineralx_report']) {
    assert.match(source, new RegExp(`registerTool\\('${name}'`));
  }
});

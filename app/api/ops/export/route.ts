import { requireOperations, rpc, loadGeology } from '@/lib/ops/server';
import { OpsError, rowsToCsv } from '@/lib/ops/contracts';
import { failure, noStore, privateResponseHeaders, scopeFrom } from '@/lib/ops/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const id = scopeFrom(request);
    const query = new URL(request.url).searchParams;
    const { db, scope } = await requireOperations(id, 'report.export');
    const kind = query.get('kind') || 'production';

    if (kind === 'geology') {
      if (!scope?.permissions.includes('geo.read')) {
        throw new OpsError('forbidden', 'Geological export is not assigned.');
      }
      const data = await loadGeology(db, scope);
      return noStore({ format: 'mineralx-shared-geology-v1', scope, generatedAt: new Date().toISOString(), ...data });
    }

    const rows: any[] = [];
    let cursor: string | null = null;
    let revision: number | undefined;
    for (;;) {
      const page = await rpc(db, 'mx_ops_list', { p_scope: id, p_kind: kind, p_after: cursor, p_limit: 500, p_id: null });
      if (revision !== undefined && revision !== page.revision) {
        throw new OpsError('conflict', 'Records changed during export. Retry to obtain one consistent revision.');
      }
      revision = page.revision;
      rows.push(...page.rows);
      if (rows.length > 100000) {
        throw new OpsError('validation', 'Select a narrower period for this export.');
      }
      if (!page.next) break;
      cursor = page.next;
    }

    const fields = rows.length ? Object.keys(rows[0]) : ['id'];
    return new Response(rowsToCsv(rows, fields), {
      headers: {
        ...privateResponseHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="MineralX-${kind.replace(/[^a-z_]/g, '')}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'X-MineralX-Revision': String(revision),
      },
    });
  } catch (error) {
    return failure(error);
  }
}

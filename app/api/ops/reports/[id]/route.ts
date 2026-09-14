import {failure, noStore, scopeFrom} from '@/lib/ops/http';
import {requireOperations, rpc} from '@/lib/ops/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const {id} = await params;
    const scopeId = scopeFrom(request);
    const {db} = await requireOperations(scopeId, 'report.read');
    return noStore(await rpc(db, 'mx_ops_report_run_read', {p_scope: scopeId, p_id: id}));
  } catch (error) {
    return failure(error);
  }
}

import {z} from 'zod';
import {OpsError} from '@/lib/ops/contracts';
import {body, failure, noStore, scopeFrom} from '@/lib/ops/http';
import {requireOperations} from '@/lib/ops/server';
import {generateReportRun, listReportRuns, reportCatalogue} from '@/lib/ops/report-service';
import {normaliseReportPeriod, REPORT_IDS} from '@/lib/ops/reporting-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const reportId = z.enum(REPORT_IDS);

function period(from: string | null, to: string | null) {
  if (Boolean(from) !== Boolean(to)) throw new OpsError('validation', 'Provide both the start and end of a reporting period.');
  return normaliseReportPeriod(from, to);
}

export async function GET(request: Request) {
  try {
    const scopeId = scopeFrom(request);
    const {db, scope} = await requireOperations(scopeId, 'report.read');
    if (!scope) throw new Error('Report workspace not found.');
    const query = new URL(request.url).searchParams;
    const selected = period(query.get('from'), query.get('to'));
    const runs = await listReportRuns(db, scope.id, null, 50);
    return noStore({...reportCatalogue(scope), scope, period: selected, runs});
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = z.object({
      scopeId: z.string().uuid(), reportId, requestId: z.string().uuid().optional(),
      from: z.string().optional(), to: z.string().optional(),
    }).strict().parse(await body(request));
    if (Boolean(input.from) !== Boolean(input.to)) throw new OpsError('validation', 'Provide both the start and end of a reporting period.');
    const {db, scope} = await requireOperations(input.scopeId, 'report.generate');
    if (!scope) throw new Error('Report workspace not found.');
    const selected = normaliseReportPeriod(input.from, input.to);
    const run = await generateReportRun({
      db, scope, reportId: input.reportId, requestId: input.requestId || crypto.randomUUID(), ...selected,
    });
    return noStore(run, 201);
  } catch (error) {
    return failure(error);
  }
}

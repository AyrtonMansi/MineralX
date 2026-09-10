import {z} from 'zod';
import {OpsError} from '@/lib/ops/contracts';
import {body, failure, noStore, scopeFrom, uuid} from '@/lib/ops/http';
import {requireOperations} from '@/lib/ops/server';
import {
  analyzeIntake,
  analyzeIntakeSchema,
  applyIntake,
  applyIntakeSchema,
  approveIntake,
  approveIntakeSchema,
  createIntake,
  createIntakeSchema,
  listIntelligence,
  readIntelligence,
} from '@/lib/intelligence/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const scopeId = scopeFrom(request);
    const parameters = new URL(request.url).searchParams;
    const intakeValue = parameters.get('intake');
    const intakeId = intakeValue ? uuid.parse(intakeValue) : undefined;
    const {db} = await requireOperations(scopeId, 'work.read');
    if (intakeId) return noStore(await readIntelligence(db, scopeId, intakeId));
    const cursorValue = parameters.get('cursor');
    const cursor = cursorValue ? uuid.parse(cursorValue) : undefined;
    const limitValue = parameters.get('limit');
    const limit = limitValue === null
      ? 50
      : z.coerce.number().int().min(1).max(100).parse(limitValue);
    return noStore(await listIntelligence(db, scopeId, {cursor, limit}));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const input = await body(request, 200_000) as Record<string, unknown>;
    const action = z.enum(['create', 'analyze', 'approve', 'apply']).parse(input.action);
    const {action: _action, ...payload} = input;
    requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined;
    const scopeId = uuid.parse(payload.scopeId);
    const {db, user, scope} = await requireOperations(scopeId, 'work.write');
    if (!scope) throw new OpsError('forbidden', 'This workspace is not assigned to your account.');
    const runtime = {db, actorId: user.id, scope};

    if (action === 'create') return noStore(await createIntake(runtime, createIntakeSchema.parse(payload)), 201);
    if (action === 'analyze') return noStore(await analyzeIntake(runtime, analyzeIntakeSchema.parse(payload)));
    if (action === 'approve') return noStore(await approveIntake(runtime, approveIntakeSchema.parse(payload)));
    return noStore(await applyIntake(runtime, applyIntakeSchema.parse(payload)));
  } catch (error) {
    return failure(error, requestId);
  }
}

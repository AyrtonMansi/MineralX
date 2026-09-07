import {OPS_RELEASE,OPS_SCHEMA} from '@/lib/ops/contracts';
import {noStore} from '@/lib/ops/http';
export const dynamic='force-dynamic';
// Identity is public; backend readiness is assessed only in the authenticated context.
export async function GET(){return noStore({product:'MineralX Operations',release:OPS_RELEASE,requiredSchema:OPS_SCHEMA,commit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'local',activation:'Check authenticated workspace access; this endpoint is not a database readiness check'});}

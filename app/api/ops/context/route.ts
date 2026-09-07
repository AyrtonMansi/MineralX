import {requireOperations,capabilities} from '@/lib/ops/server';
import {noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function GET(){try{const {context}=await requireOperations();return noStore({...context,capabilities:capabilities()});}catch(e){return failure(e);}}

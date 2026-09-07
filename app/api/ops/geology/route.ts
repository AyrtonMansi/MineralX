import {requireOperations,loadGeology,geologyCommand} from '@/lib/ops/server';import {commandSchema} from '@/lib/ops/contracts';import {scopeFrom,body,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:Request){try{const id=scopeFrom(request),{db,scope}=await requireOperations(id,'geo.read');return noStore(await loadGeology(db,scope));}catch(e){return failure(e);}}
export async function POST(request:Request){try{const command=commandSchema.parse(await body(request));return noStore(await geologyCommand(command,true));}catch(e){return failure(e);}}

import {body,failure,noStore} from '@/lib/ops/http';
import {reviewCandidate} from '@/lib/ops/meetings/server';
export async function POST(request:Request){try{return noStore(await reviewCandidate(await body(request,25000)));}catch(e){return failure(e);}}

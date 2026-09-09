import {body,failure,noStore} from '@/lib/ops/http';
import {importMeeting,meetingIndex} from '@/lib/ops/meetings/server';
export const dynamic='force-dynamic';
export async function GET(){try{return noStore(await meetingIndex());}catch(e){return failure(e);}}
export async function POST(request:Request){try{return noStore(await importMeeting(await body(request,900000)));}catch(e){return failure(e);}}

import {requireSession} from '@/lib/ops/server';
import {noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function GET(){try{const {db,user}=await requireSession();const {data,error}=await db.from('gic_members').select('workspace_id,role,workspace:gic_workspaces(name)').eq('user_id',user.id);if(error)throw error;return noStore({workspaces:(data||[]).filter(r=>r.role==='owner')});}catch(e){return failure(e);}}

import plan from '@/data/plant-p5.json';
import {plantSchema} from '@/lib/plant/model';
import {applyPlantDesignOperations,plantModelFingerprint} from '@/lib/plant/design';
import {OpsError} from '@/lib/ops/contracts';
import {requireOperations,rpc} from '@/lib/ops/server';
import {failure,noStore,scopeFrom,uuid} from '@/lib/ops/http';

export const dynamic='force-dynamic';
const baseModel=plantSchema.parse(plan);

export async function GET(request:Request){try{
 const scope=scopeFrom(request),id=uuid.parse(new URL(request.url).searchParams.get('id'));
 const {db}=await requireOperations(scope,'plant.read');
 const record=await rpc(db,'mx_ops_plant_design_read',{p_scope:scope,p_id:id}) as any;
 if(!record||record.id!==id)throw new OpsError('not_found','This Engineering proposal is not available in the selected facility.');
 if(record.base_revision!==baseModel.revision||record.base_fingerprint!==plantModelFingerprint(baseModel))throw new OpsError('conflict','This proposal targets an older plant basis. Rebase it before using the geometry for a new decision.');
 const applied=applyPlantDesignOperations(baseModel,record.operations);
 if(!applied.validation.ok)throw new OpsError('validation','This stored proposal no longer passes deterministic plant-layout validation.');
 return noStore({record,model:applied.model,validation:applied.validation});
}catch(error){return failure(error);}}

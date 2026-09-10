import {OpsError} from '@/lib/ops/contracts';
import {planningResultNeedsRetry, type IntelligencePlanningResult} from './engine';

/** Gate the irreversible received -> proposed transition. A completed but
 * malformed response is reviewable evidence; transport/provider failure is not. */
export function requirePersistablePlanningResult(result:IntelligencePlanningResult){
  if(planningResultNeedsRetry(result)){
    throw new OpsError(
      'unavailable',
      'Intelligence analysis could not be completed. The verified originals are preserved; retry this intake.',
    );
  }
  return result;
}

import { OpsError } from './contracts';

/** Keep confirmed data visible only while a request is transiently unavailable. */
export function retainResourceOnFailure(error: unknown) {
  return error instanceof OpsError && error.code === 'unavailable';
}

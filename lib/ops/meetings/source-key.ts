import { createHash } from 'node:crypto';

type ManualSourceIdentity = {
  sourceUrl: string;
  sourceHash: string;
  title: string;
  heldOn: string;
};

/**
 * A Gmail permalink identifies one source across corrections. Without that
 * durable identifier, only an exact title, date and note copy is deduplicated;
 * a changed manual note is intentionally a separate meeting record.
 */
export function manualSourceKey({ sourceUrl, sourceHash, title, heldOn }: ManualSourceIdentity) {
  const fallback = `${heldOn}\n${title.trim().toLowerCase()}\n${sourceHash}`;
  return `manual:${createHash('sha256').update(sourceUrl || fallback).digest('hex')}`;
}

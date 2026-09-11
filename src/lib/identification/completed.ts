/**
 * Pure gate for the `identification.completed` automation trigger.
 *
 * Writers (scan-out POST, pick session start) map to IdentificationResult then
 * call this. GET claim faces must not emit. No `@/lib/db`.
 */

import type { IdentificationResult, JobFaceState } from './types';

const EMIT_STATES = new Set<JobFaceState>(['ready', 'blocked', 'done']);

export function shouldEmitIdentificationCompleted(result: IdentificationResult): boolean {
  if (result.entity.kind !== 'order') return false;
  const orderId = Number(result.entity.id);
  if (!Number.isFinite(orderId) || orderId <= 0) return false;
  if (result.face.state === 'miss' || result.face.state === 'error' || result.face.state === 'ambiguous') {
    return false;
  }
  return EMIT_STATES.has(result.face.state);
}

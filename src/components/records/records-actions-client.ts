/**
 * Browser calls for the Records sheet's writes (`src/app/api/records/*`,
 * bodies in `src/lib/records/sheet-actions-contract.ts`). Every write
 * answers one result per line; a refusal of the whole request (the
 * order-number collision's 409, a permission) throws its `error` text. A
 * write the server holds for a fresh PIN (`403 STEPUP_REQUIRED` — Delete's
 * `orders.void`) opens the house step-up and retries once
 * (`fetchWithStepUp`; the caller passes `useStepUp()`).
 */

import { fetchWithStepUp } from '@/components/auth/StepUpModal';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type {
  RecordActionBody,
  RecordActionResponse,
  RecordDeleteBody,
  RecordOrderNumberBody,
  RecordTrackingBody,
  RecordTrackingUnlinkBody,
} from '@/lib/records/sheet-actions-contract';

export type RecordWrite =
  | { path: '/api/records/tracking'; body: RecordTrackingBody }
  | { path: '/api/records/tracking/unlink'; body: RecordTrackingUnlinkBody }
  | { path: '/api/records/order-number'; body: RecordOrderNumberBody }
  | { path: '/api/records/delete'; body: RecordDeleteBody }
  | { path: '/api/records/actions'; body: RecordActionBody };

export async function postRecordWrite(write: RecordWrite, requestStepUp: (scope: string) => Promise<boolean>): Promise<RecordActionResponse> {
  const res = await fetchWithStepUp(
    write.path,
    {
      method: 'POST',
      credentials: 'same-origin',
      // One key per press: a retried note never appends twice (`/api/records/actions` honours it).
      headers: {
        'Content-Type': 'application/json',
        ...(write.path === '/api/records/actions' ? { 'Idempotency-Key': safeRandomUUID() } : {}),
      },
      body: JSON.stringify(write.body),
    },
    requestStepUp,
  );
  const json = (await res.json().catch(() => ({}))) as Partial<RecordActionResponse> & { error?: unknown };
  if (!res.ok) throw new Error(String(json.error === 'STEPUP_REQUIRED' ? 'A PIN is needed to do that' : (json.error ?? `Request failed (${res.status})`)));
  return { results: Array.isArray(json.results) ? json.results : [] };
}

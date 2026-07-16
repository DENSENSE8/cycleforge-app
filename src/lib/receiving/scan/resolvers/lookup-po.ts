/**
 * lookup-po resolver — local-DB-only fetch ladder, classified into a result.
 *
 * Always calls with `localOnly: true`. Live Zoho / inventory is never on the
 * scan hot path (tracking, ticket#, order/PO#, auto). Misses return
 * `not_found` (order/ticket) or `unmatched` (tracking unfound carton).
 * Operator-initiated promote + crons remain the only Zoho paths.
 *
 * Returns a {@link LookupPoResolution} the hook applies; throws on a hard
 * failure (`!success`) so the caller's existing catch reports it. Pure +
 * dependency-injected (`lookupPo`) → DB/React-free.
 */

import type { LookupPoDeps, LookupPoInput, LookupPoResolution } from '../types';

export async function resolveViaLookupPo(
  input: LookupPoInput,
  deps: LookupPoDeps,
): Promise<LookupPoResolution> {
  const data = await deps.lookupPo({
    trackingNumber: input.callValue,
    staffId: input.staffId,
    mode: input.callMode,
    localOnly: true,
    intakeSurface: input.intakeSurface,
  });

  if (!data?.success) {
    throw new Error((typeof data?.error === 'string' ? data.error : '') || 'Lookup failed');
  }

  // The PO header matched but its line items could not import because Zoho isn't
  // connected — the caller surfaces the real cause and routes to reconnect.
  // (Scan no longer live-imports; this still covers residual server signals.)
  if (data.integration_error === 'zoho_not_connected') {
    return { kind: 'integration-error', data };
  }

  const isMatched =
    Boolean(data.matched) && Array.isArray(data.lines) && data.lines.length > 0;

  // Order# lookups that resolve to nothing are a clean not-found (a mistyped
  // PO/order number must NOT create a phantom box); ticket# lookups behave the
  // same — the caller toasts instead.
  if (!isMatched && (input.originalMode === 'order' || input.originalMode === 'ticket' || data.not_found)) {
    return { kind: 'not_found', data };
  }

  return isMatched ? { kind: 'matched', data } : { kind: 'unmatched', data };
}

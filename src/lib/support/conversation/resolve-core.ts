/**
 * Resolve a Support item (contract rule 4): refused with its blockers unless
 * nothing is outstanding, or override + reason. Task DONE + item resolved +
 * check-in closed in ONE transaction; resolving twice is a no-op.
 */
import type { OrgId } from '@/lib/tenancy/constants';

import type { SupportResolveBlocker } from './model';
import type { SupportTransaction } from './store';
import { resolveInStore } from './transitions';

export interface ResolveSupportItemInput {
  orgId: OrgId;
  supportItemId: number;
  staffId: number | null;
  reason?: string | null;
  override?: boolean;
  checkInDisposition?: 'resolved' | 'no_response_closed' | null;
}

export type ResolveSupportItemResult =
  | { ok: true; idempotent: boolean; override: boolean; blockers: SupportResolveBlocker[] }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: 'blocked'; blockers: SupportResolveBlocker[] }
  | { ok: false; status: 422; error: 'reason_required' };

export interface ResolveSupportItemDeps {
  transaction: SupportTransaction;
  now: () => number;
}

/** The rules half of `resolveSupportItem` (./resolve binds Postgres). */
export async function resolveSupportItemCore(
  input: ResolveSupportItemInput,
  d: ResolveSupportItemDeps,
): Promise<ResolveSupportItemResult> {
  const reason = input.reason?.trim() || null;
  if (input.checkInDisposition === 'no_response_closed' && !reason) {
    return { ok: false, status: 422, error: 'reason_required' };
  }
  return d.transaction(input.orgId, async (store): Promise<ResolveSupportItemResult> => {
    const item = await store.lockItem(input.supportItemId);
    if (!item) return { ok: false, status: 404, error: `Support item ${input.supportItemId} not found` };
    const result = await resolveInStore(store, {
      item,
      staffId: input.staffId,
      reason,
      override: input.override === true,
      checkInDisposition: input.checkInDisposition ?? null,
      nowMs: d.now(),
    });
    if (result.ok) return result;
    if (result.status === 409) return { ok: false, status: 409, error: 'blocked', blockers: result.blockers };
    return result;
  });
}

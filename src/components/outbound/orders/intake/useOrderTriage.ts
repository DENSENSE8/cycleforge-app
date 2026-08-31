'use client';

/**
 * The triage form's data layer — reads the live gates, writes the things the
 * form can change.
 *
 * Every write re-reads the gates afterwards rather than patching a local copy.
 * The gates are derived from facts spread across `orders`, `documents` and
 * `shipping_tracking_numbers`, several of which the operator can change from
 * OTHER surfaces (buying a label in the Labels tab, attaching a manual in the
 * order's documents panel). A locally-patched gate would be a guess about
 * facts this form does not own, and the one place a guess must never appear is
 * the control that decides whether an order reaches the floor.
 *
 * The create draft is `CanonicalOrderIntake` — the SAME type the CSV staging
 * lane projects onto (`docs/todo/order-intake-acknowledgment-PLAN.md` §2), so
 * single and bulk density share one field list.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  intakePlatformState,
  resolveIntakeAccountSource,
  type CanonicalOrderIntake,
} from '@/lib/orders/canonical-order-intake';
import type { CagedOrderRecord } from '@/lib/orders/caged-orders';
import type { EvaluatedReleaseGates } from '@/lib/orders/release-gates';
import {
  CAGED_ORDERS_QUERY_ROOT,
  orderReleaseGatesQuery,
} from '@/lib/queries/caged-orders-queries';
import { invalidateUnshippedCounts } from '@/lib/queries/dashboard-cache-patch';
import { safeRandomUUID } from '@/lib/safe-uuid';

interface CageActionResponse {
  success: boolean;
  error?: string;
  order?: CagedOrderRecord;
  gates?: EvaluatedReleaseGates;
}

async function postCageAction(
  orderId: number,
  body: Record<string, unknown>,
): Promise<CageActionResponse> {
  const res = await fetch(`/api/orders/${orderId}/cage-release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ success: false }))) as CageActionResponse;
}

/**
 * Duplicate acknowledgment: does this org already have an order with this
 * number? Uses the existing lookup route (human order # → order detail) so the
 * form can offer "open that order in triage" instead of inserting a second row
 * and learning about it from the 409.
 */
export async function lookupExistingOrder(
  orderNumber: string,
): Promise<{ id: number; orderNumber: string } | null> {
  const q = orderNumber.trim();
  if (!q) return null;
  try {
    const res = await fetch(`/api/orders/lookup/${encodeURIComponent(q)}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      order?: { id?: number; order_id?: string };
    } | null;
    if (!data?.ok || !data.order?.id) return null;
    // The lookup also resolves carrier tracking — only an exact order-number
    // hit counts as a duplicate here.
    if (String(data.order.order_id ?? '') !== q) return null;
    return { id: Number(data.order.id), orderNumber: String(data.order.order_id) };
  } catch {
    return null;
  }
}

/** Catalog pair: item number (ASIN / eBay listing id) → sku_catalog. */
export async function pairCatalogByItemNumber(
  itemNumber: string,
): Promise<{ sku: string; productTitle: string } | null> {
  const q = itemNumber.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `/api/sku-catalog/by-item-number?itemNumber=${encodeURIComponent(q)}`,
      { credentials: 'same-origin' },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      status?: string;
      catalog?: { sku?: string; productTitle?: string };
    } | null;
    if (!data?.success || data.status !== 'resolved' || !data.catalog) return null;
    return {
      sku: String(data.catalog.sku ?? ''),
      productTitle: String(data.catalog.productTitle ?? ''),
    };
  } catch {
    return null;
  }
}

export interface OrderParcelDraft {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export interface OrderTriage {
  /** The order under triage, with live gates. `null` before one exists. */
  record: CagedOrderRecord | null;
  loading: boolean;
  /** Create a caged order from the identity section. Resolves to its id. */
  createCaged: (draft: CanonicalOrderIntake) => Promise<number | null>;
  creating: boolean;
  setDocsNotRequired: (value: boolean) => void;
  savingDocsFlag: boolean;
  /** Persist parcel weight + dims on the order (the ONE parcel write path). */
  setParcel: (parcel: OrderParcelDraft) => void;
  savingParcel: boolean;
  release: () => void;
  releasing: boolean;
  refresh: () => void;
}

export function useOrderTriage(orderId: number | null): OrderTriage {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const gatesQuery = useQuery(orderReleaseGatesQuery(orderId));

  const invalidateCage = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [CAGED_ORDERS_QUERY_ROOT] });
  }, [queryClient]);

  /**
   * Create → cage, in that order.
   *
   * `/api/orders/add` is the existing create path and stays the only one — the
   * plan forbids a second intake engine. The order is caged in a follow-up call
   * rather than by a new flag on `add`, so every OTHER caller of `add` (CSV
   * import, mobile verification, the sync backfill) keeps landing straight in
   * the working set exactly as it does today. Only orders typed at THIS form
   * are caged.
   */
  const createCaged = useCallback(
    async (draft: CanonicalOrderIntake): Promise<number | null> => {
      const orderNumber = draft.orderNumber.trim();
      const productTitle = draft.productTitle.trim();
      if (!orderNumber || !productTitle) {
        toast.error('Order number and title are required to start triage.');
        return null;
      }
      // Acknowledge, don't guess: an unknown-shaped id has no channel anyone
      // can vouch for, so the operator must pick one before the order exists.
      const platform = intakePlatformState(orderNumber);
      if (platform.requiresChoice && !draft.platformChosen.trim()) {
        toast.error('Pick a platform — this order number’s shape doesn’t name one.');
        return null;
      }

      setCreating(true);
      try {
        // Per-submit key so a flaky-network retry replays instead of inserting
        // a second order (orders.add idempotency).
        const idempotencyKey = safeRandomUUID();
        const trackingBlobs = draft.trackingNumbers
          .map((t) => t.trim())
          .filter(Boolean);
        const res = await fetch('/api/orders/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            orderId: orderNumber,
            productTitle,
            sku: draft.sku.trim() || null,
            // A CSV cell can carry anything; the queue's quantity is a whole
            // number ≥ 1, so normalize rather than bounce the whole create.
            quantity: String(Math.max(1, parseInt(draft.quantity, 10) || 1)),
            shippingTrackingNumbers: trackingBlobs,
            condition: draft.condition.trim() || null,
            accountSource: resolveIntakeAccountSource({
              platformInferred: platform.inferred,
              platformChosen: draft.platformChosen,
            }),
            idempotencyKey,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          order?: { id?: number };
        };

        if (!data.success || !data.order?.id) {
          toast.error(data.error || 'Could not create the order.');
          return null;
        }
        const newId = Number(data.order.id);

        // Item number is a separate existing route (orders.add does not take
        // one). Non-fatal: a missing item number just leaves G1 red, which is
        // exactly what the cage is for.
        const itemNumber = draft.itemNumber.trim();
        if (itemNumber) {
          await fetch('/api/orders/set-item-number', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ id: newId, itemNumber }),
          }).catch(() => null);
        }

        const caged = await postCageAction(newId, { action: 'cage' });
        if (!caged.success) {
          // The order exists but is not caged — say so rather than pretending
          // it is held. An uncaged order is live work, not a silent draft.
          toast.error('Order created, but it could not be caged — it is live now.');
        }

        // A CSV-prefilled draft can already carry a parcel — land it now so
        // the Shipping section (and the rate-shop) reads it back. Non-fatal.
        if (draft.weightOz != null || draft.dimL != null) {
          await postCageAction(newId, {
            action: 'set-parcel',
            weightOz: draft.weightOz,
            lengthIn: draft.dimL,
            widthIn: draft.dimW,
            heightIn: draft.dimH,
          }).catch(() => null);
        }

        invalidateCage();
        invalidateUnshippedCounts(queryClient);
        return newId;
      } finally {
        setCreating(false);
      }
    },
    [invalidateCage, queryClient],
  );

  const docsFlagMutation = useMutation({
    mutationFn: async (value: boolean) => {
      if (!orderId) return null;
      const data = await postCageAction(orderId, {
        action: 'docs-not-required',
        value,
      });
      if (!data.success) throw new Error(data.error || 'Could not save that.');
      return data.order ?? null;
    },
    onSuccess: () => {
      void gatesQuery.refetch();
      invalidateCage();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const parcelMutation = useMutation({
    mutationFn: async (parcel: OrderParcelDraft) => {
      if (!orderId) return null;
      const data = await postCageAction(orderId, {
        action: 'set-parcel',
        weightOz: parcel.weightOz,
        lengthIn: parcel.lengthIn,
        widthIn: parcel.widthIn,
        heightIn: parcel.heightIn,
      });
      if (!data.success) throw new Error(data.error || 'Could not save the parcel.');
      return data.order ?? null;
    },
    onSuccess: () => {
      void gatesQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) return null;
      const data = await postCageAction(orderId, { action: 'release' });
      if (!data.success) {
        // 409 GATES_NOT_MET carries the LIVE failures — surface those, not a
        // generic error, so the operator sees which fact moved under them.
        const failed = data.gates?.failing?.map((g) => g.label).join(', ');
        throw new Error(
          failed ? `Still blocked: ${failed}` : data.error || 'Release failed.',
        );
      }
      return data.order ?? null;
    },
    onSuccess: (order) => {
      if (order) toast.success('Released into To ship.');
      void gatesQuery.refetch();
      invalidateCage();
      invalidateUnshippedCounts(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    record: gatesQuery.data ?? null,
    loading: gatesQuery.isLoading,
    createCaged,
    creating,
    setDocsNotRequired: (value: boolean) => docsFlagMutation.mutate(value),
    savingDocsFlag: docsFlagMutation.isPending,
    setParcel: (parcel: OrderParcelDraft) => parcelMutation.mutate(parcel),
    savingParcel: parcelMutation.isPending,
    release: () => releaseMutation.mutate(),
    releasing: releaseMutation.isPending,
    refresh: () => {
      void gatesQuery.refetch();
    },
  };
}

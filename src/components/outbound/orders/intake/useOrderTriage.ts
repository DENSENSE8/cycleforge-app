'use client';

/**
 * The intake form's data layer: create the order (every line, one number),
 * hold it in the cage, land what the form collected (item numbers, parcel,
 * admin link, label PDF, the documents exemption), and release it into To
 * ship. Every write is an existing route; `/api/orders/add` is the one create.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { CagedOrderRecord } from '@/lib/orders/caged-orders';
import type { EvaluatedReleaseGates } from '@/lib/orders/release-gates';
import { CAGED_ORDERS_QUERY_ROOT, orderReleaseGatesQuery } from '@/lib/queries/caged-orders-queries';
import { invalidateUnshippedCounts } from '@/lib/queries/dashboard-cache-patch';
import { refreshDomain } from '@/lib/refresh/bus';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { orderNumberPrefix } from '@/lib/orders/manual-order-draft';
import { intakeCreateBody, type IntakeIntent, type IntakeState } from './intake-model';

interface CageActionResponse {
  success: boolean;
  error?: string;
  order?: CagedOrderRecord;
  gates?: EvaluatedReleaseGates;
}

async function postCageAction(orderId: number, body: Record<string, unknown>): Promise<CageActionResponse> {
  const res = await fetch(`/api/orders/${orderId}/cage-release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ success: false }))) as CageActionResponse;
}

/** An order that already carries this number, or `null` (fresh read, never cached). */
export async function findOrderByNumber(orderNumber: string): Promise<{ id: number; orderNumber: string } | null> {
  const q = orderNumber.trim();
  if (!q) return null;
  const res = await fetch(`/api/orders/intake/order-number?check=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
  const data = (await res.json().catch(() => null)) as { taken?: { id: number; orderNumber: string } | null } | null;
  return data?.taken ?? null;
}

/** The next free number under the channel's prefix (`PH-000124`), or `null` when it cannot be read. */
export async function nextOrderNumber(channel: string): Promise<string | null> {
  const prefix = orderNumberPrefix(channel);
  const res = await fetch(`/api/orders/intake/order-number?prefix=${encodeURIComponent(prefix)}`, {
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => null)) as { next?: string } | null;
  return data?.next ?? null;
}

export interface ParcelInput {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export interface IntakeSaveResult {
  orderIds: number[];
  orderNumber: string;
  released: boolean;
}

/** Whole numbers > 0 from the parcel's typed text; blank stays `null`. */
export function parcelFromText(p: IntakeState['parcel']): ParcelInput {
  const n = (raw: string) => {
    const v = Number(raw);
    return raw.trim() && Number.isFinite(v) && v > 0 ? v : null;
  };
  return { weightOz: n(p.weightOz), lengthIn: n(p.lengthIn), widthIn: n(p.widthIn), heightIn: n(p.heightIn) };
}

async function uploadLabelPdf(orderId: number, orderRef: string, file: File): Promise<boolean> {
  const form = new FormData();
  form.append('file', file);
  form.append('documentType', 'shipping_label');
  form.append('orderRef', orderRef);
  const res = await fetch(`/api/orders/${orderId}/documents/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return res.ok;
}

async function patchOrder(orderId: number, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return res.ok;
}

/** Release every line; the failures are the LIVE gate reasons, never a generic error. */
async function releaseLines(orderIds: readonly number[]): Promise<string | null> {
  const blocked = new Set<string>();
  for (const id of orderIds) {
    const data = await postCageAction(id, { action: 'release' });
    if (data.success) continue;
    const failing = data.gates?.failing?.map((g) => g.label) ?? [];
    if (failing.length === 0) blocked.add(data.error || 'Release failed');
    for (const label of failing) blocked.add(label);
  }
  return blocked.size > 0 ? `Still blocked: ${[...blocked].join(', ')}` : null;
}

export function useOrderTriage(orderId: number | null) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const gatesQuery = useQuery(orderReleaseGatesQuery(orderId));

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [CAGED_ORDERS_QUERY_ROOT] });
    invalidateUnshippedCounts(queryClient);
    refreshDomain('orders.outbound');
  }, [queryClient]);

  /**
   * Create the order caged, then land the rest. `release` also lets it out
   * when the gates are green; when they are not the order stays caged and
   * the form stays on it, naming what still blocks.
   */
  const save = useCallback(
    async (state: IntakeState, opts: { intent: IntakeIntent; labelFile: File | null }): Promise<IntakeSaveResult | null> => {
      setSaving(true);
      try {
        let body = intakeCreateBody(state);
        let created: { orderIds?: number[]; order?: { id?: number } } | null = null;
        // A generated number someone took meanwhile is re-generated (three tries); a typed one is the operator's call.
        for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
          const idempotencyKey = safeRandomUUID();
          const res = await fetch('/api/orders/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            credentials: 'same-origin',
            body: JSON.stringify({ ...body, idempotencyKey }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            error?: string;
            orderIds?: number[];
            order?: { id?: number };
          };
          if (data.success && (data.orderIds?.length || data.order?.id)) {
            created = data;
            break;
          }
          if (res.status === 409 && state.orderNumberGenerated) {
            const next = await nextOrderNumber(state.channel);
            if (next && next !== body.orderId) {
              body = { ...body, orderId: next };
              continue;
            }
          }
          toast.error(data.error || 'Could not create the order.');
          return null;
        }
        if (!created) {
          toast.error('Could not find a free order number — type one.');
          return null;
        }
        const orderIds = created.orderIds?.length ? created.orderIds : [Number(created.order?.id)];
        const orderNumber = body.orderId;

        const adminUrl = state.adminUrl.trim();
        await Promise.all(
          orderIds.map((id, i) => {
            const itemNumber = state.lines[i]?.itemNumber.trim();
            const patch = { ...(itemNumber ? { itemNumber } : {}), ...(adminUrl ? { adminUrl } : {}) };
            return Object.keys(patch).length > 0 ? patchOrder(id, patch) : Promise.resolve(true);
          }),
        );

        const caged = await Promise.all(orderIds.map((id) => postCageAction(id, { action: 'cage' })));
        if (caged.some((r) => !r.success)) toast.error('Order created, but a line could not be caged — it is live now.');

        const parcel = parcelFromText(state.parcel);
        if (Object.values(parcel).some((v) => v != null)) {
          await Promise.all(orderIds.map((id) => postCageAction(id, { action: 'set-parcel', ...parcel })));
        }
        if (state.docsNotRequired) {
          await Promise.all(orderIds.map((id) => postCageAction(id, { action: 'docs-not-required', value: true })));
        }
        if (opts.labelFile && state.shippingMode === 'elsewhere') {
          const ok = await uploadLabelPdf(orderIds[0]!, orderNumber, opts.labelFile);
          if (!ok) toast.error('Order saved, but the label file did not upload — add it again below.');
        }

        let released = false;
        if (opts.intent === 'release') {
          const blocked = await releaseLines(orderIds);
          released = blocked == null;
          if (blocked) toast.error(`Saved as a draft. ${blocked}.`);
          else toast.success(`Order ${orderNumber} released into To ship.`);
        } else {
          toast.success(`Draft ${orderNumber} saved.`);
        }
        settle();
        return { orderIds, orderNumber, released };
      } finally {
        setSaving(false);
      }
    },
    [settle],
  );

  /** Release a saved (caged) order — every line the session knows. */
  const release = useCallback(
    async (orderIds: readonly number[]): Promise<boolean> => {
      setReleasing(true);
      try {
        const blocked = await releaseLines(orderIds);
        if (blocked) toast.error(blocked);
        else toast.success('Released into To ship.');
        void gatesQuery.refetch();
        settle();
        return blocked == null;
      } finally {
        setReleasing(false);
      }
    },
    [gatesQuery, settle],
  );

  /** Bound session: persist a change on every line, then re-read the gates. */
  const onLines = useCallback(
    async (orderIds: readonly number[], body: Record<string, unknown>) => {
      const results = await Promise.all(orderIds.map((id) => postCageAction(id, body)));
      const failed = results.find((r) => !r.success);
      if (failed) toast.error(failed.error || 'Could not save that.');
      void gatesQuery.refetch();
    },
    [gatesQuery],
  );

  const attachTracking = useCallback(
    async (orderIds: readonly number[], trackingNumber: string, labelFile: File | null, orderRef: string) => {
      const results = await Promise.all(
        orderIds.map((id) =>
          fetch(`/api/orders/${id}/tracking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ trackingNumber }),
          }).then((r) => r.ok),
        ),
      );
      if (results.some((ok) => !ok)) toast.error('Could not link that tracking number.');
      if (labelFile && !(await uploadLabelPdf(orderIds[0]!, orderRef, labelFile))) {
        toast.error('The label file did not upload.');
      }
      void gatesQuery.refetch();
      settle();
    },
    [gatesQuery, settle],
  );

  return {
    /** The bound order with live gates; `null` before one exists. */
    record: gatesQuery.data ?? null,
    save,
    saving,
    release,
    releasing,
    setParcel: (orderIds: readonly number[], parcel: ParcelInput) => onLines(orderIds, { action: 'set-parcel', ...parcel }),
    setDocsNotRequired: (orderIds: readonly number[], value: boolean) =>
      onLines(orderIds, { action: 'docs-not-required', value }),
    attachTracking,
    refresh: () => void gatesQuery.refetch(),
  };
}

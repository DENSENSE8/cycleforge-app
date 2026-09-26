'use client';

import { Suspense, useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DetailAck, DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { SkuExceptionScreen } from '@/components/mobile/onhold/SkuExceptionScreen';
import {
  SkuExceptionEditSheet,
  type SkuExceptionDraft,
  type SkuExceptionEditError,
} from '@/components/mobile/onhold/SkuExceptionEditSheet';
import { IconButton } from '@/design-system/primitives';
import { Pencil } from '@/components/Icons';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { mobileSkuExceptionHref, skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * `/m/on-hold/[sku]/info` — every fact of the SKU exception in full, and its
 * one edit (title + description, plus the barcode while it has none), opened
 * from the pencil in the bar or the Barcode row's "Add barcode".
 */
function SkuExceptionInfoInner() {
  const params = useParams<{ sku: string }>();
  const sku = decodeURIComponent(params?.sku ?? '');
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<SkuExceptionEditError | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  const openEdit = useCallback(() => {
    setEditError(null);
    setEditOpen(true);
  }, []);

  const save = useCallback(
    async (draft: SkuExceptionDraft, changed: string[]) => {
      setSaving(true);
      setEditError(null);
      try {
        const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(sku)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productTitle: draft.productTitle.trim(),
            description: draft.description.trim() || null,
            ...(changed.includes('barcode') ? { barcode: draft.barcode.trim() } : {}),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          conflictSku?: string | null;
          item?: { updatedAt?: string };
        } | null;
        if (!res.ok) {
          setEditError({ message: body?.error || `HTTP ${res.status}`, conflictSku: body?.conflictSku ?? null });
          return;
        }
        await invalidateSkuExceptions(queryClient);
        const stamp = body?.item?.updatedAt;
        setAck(`Saved — ${changed.join(', ')}${stamp ? ` · ${formatMonthDayTimePST(stamp)}` : ''}`);
        setEditOpen(false);
      } catch (err) {
        setEditError({ message: err instanceof Error ? err.message : 'Save failed' });
      } finally {
        setSaving(false);
      }
    },
    [queryClient, sku],
  );

  return (
    <SkuExceptionScreen
      sku={sku}
      subtitle="Details"
      backHref={mobileSkuExceptionHref(sku)}
      right={() => (
        <IconButton
          ariaLabel="Edit details"
          onClick={openEdit}
          icon={<Pencil className="h-5 w-5" />}
          className="flex h-11 w-11 items-center justify-center text-mode-ink"
        />
      )}
    >
      {(item) => (
        <>
          <div className="flex-1 divide-y divide-mode-rule">
            {ack ? <DetailAck onDismiss={() => setAck(null)}>{ack}</DetailAck> : null}
            <DetailFacts>
              <DetailFact label="Title" value={item.productTitle || null} />
              <DetailFact label="Description" value={item.description?.trim() || null} />
              <DetailFact label="SKU" value={item.sku} mono copy={item.sku} />
              <DetailFact
                label="Barcode"
                value={item.barcode ? item.barcode : <span className="text-mode-muted">No barcode</span>}
                hint={item.barcode ? undefined : 'Add one with the pencil'}
                mono={Boolean(item.barcode)}
                copy={item.barcode || null}
              />
              <DetailFact label="On hand" value={String(item.stock)} />
              <DetailFact label="Photos" value={String(item.photoCount)} />
              <DetailFact
                label="Locations"
                value={
                  item.locations.length > 0
                    ? item.locations.map((loc) => `${skuExceptionLocationFace(loc.barcode)} ×${loc.qty}`).join(', ')
                    : null
                }
              />
              <DetailFact
                label="Created"
                value={item.createdByName || null}
                hint={item.createdAt ? formatMonthDayTimePST(item.createdAt) : undefined}
              />
              {item.updatedAt ? <DetailFact label="Updated" value={formatMonthDayTimePST(item.updatedAt)} /> : null}
            </DetailFacts>
          </div>
          <SkuExceptionEditSheet
            open={editOpen}
            item={item}
            saving={saving}
            error={editError}
            onSave={(draft, changed) => void save(draft, changed)}
            onClose={() => setEditOpen(false)}
          />
        </>
      )}
    </SkuExceptionScreen>
  );
}

export default function SkuExceptionInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <SkuExceptionInfoInner />
    </Suspense>
  );
}

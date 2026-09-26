'use client';

import { useCallback, useState } from 'react';
import { Pencil } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { HandlingUnitChip } from '@/components/receiving/HandlingUnitChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  CartonAddPopover,
  type AssignedBox,
  type CartonAddSelection,
} from '@/components/receiving/workspace/CartonAddPopover';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

/** Carton add action — a `+` button (same shape as the unfound "+ Add item" CTA) that opens the shared CartonAddPopover (Item · Web · Box). */
export function CartonAddAction({ receivingId, unitIds }: { receivingId: number; unitIds: number[] }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<AssignedBox | null>(null);

  // Add an off-PO extra item to this matched carton, then refresh the accordion
  // so the new line shows. The receive flow leaves it Zoho-unlinked (skipped
  // from the Zoho POST); the operator reconciles it on the PO separately.
  const addOffPoLine = useCallback(
    async (sel: CartonAddSelection) => {
      const clientEventId = `add-offpo-${receivingId}-${Date.now()}`;
      const res = await fetch('/api/receiving/add-unmatched-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientEventId },
        body: JSON.stringify({
          receiving_id: receivingId,
          allow_off_po: true,
          sku_catalog_id: sel.sku_catalog_id,
          ...(sel.sku_platform_id_row != null && sel.sku_platform_id_row > 0
            ? { sku_platform_id_row: sel.sku_platform_id_row }
            : {}),
          sku: sel.sku || undefined,
          item_name: sel.item_name,
          client_event_id: clientEventId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        toast.error(body.error ?? `add failed (${res.status})`);
        return;
      }
      toast.success(`Added off-PO · ${sel.item_name || sel.sku || 'item'}`);
      // The accordion invalidates its siblings query on this event.
      refreshDomains(REFRESH_BUNDLES.receivingWrite);
      setOpen(false);
    },
    [receivingId],
  );

  return (
    <div className="flex items-center gap-1.5">
      {box ? (
        <HandlingUnitChip handlingUnitId={box.id} code={box.code} unitCount={box.total} dense />
      ) : null}
      <HoverTooltip label="Edit carton items — off-PO item, web result, or a handling-unit box" asChild>
        <IconButton
          ariaLabel="Edit carton items"
          onClick={() => setOpen(true)}
          className="flex h-6 w-6 items-center justify-center rounded-xl bg-blue-600 transition-colors hover:bg-blue-700"
          icon={<Pencil className="h-3.5 w-3.5 text-white" />}
        />
      </HoverTooltip>
      {open ? (
        <CartonAddPopover
          tabs={['item', 'web', 'box']}
          initialTab="item"
          unitIds={unitIds}
          onAddLine={addOffPoLine}
          addLineHint="Adds as an off-PO item — not on the purchase order. Reconcile it in inventory separately."
          onAssignedBox={setBox}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

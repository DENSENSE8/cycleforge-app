'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

/** Trimmed PO# for a row — number wins over id. */
function poValueOf(row: ReceivingLineRow): string {
  return (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
}

/** PO# binding for a receiving line: */
export function usePoBinding(row: ReceivingLineRow) {
  const [poEditorOpen, setPoEditorOpen] = useState(
    () => row.receiving_source !== 'unmatched' && !poValueOf(row),
  );
  const [poNumberEdit, setPoNumberEdit] = useState(() => poValueOf(row));

  // Seed the edited value from the row on every line switch.
  useEffect(() => {
    setPoNumberEdit(poValueOf(row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.zoho_purchaseorder_number, row.zoho_purchaseorder_id]);

  // Re-arm the PO# editor for matched-but-un-bound rows so the operator doesn't have to click the pencil after each switch — and COLLAPSE it…
  useEffect(() => {
    setPoEditorOpen(row.receiving_source !== 'unmatched' && !poValueOf(row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.receiving_source, row.zoho_purchaseorder_number, row.zoho_purchaseorder_id]);

  /** Save the operator-typed PO# to the carton. */
  const persistPoNumber = useCallback(
    async (nextRaw: string) => {
      if (row.receiving_id == null) return;
      const next = String(nextRaw || '').trim();
      try {
        const res = await fetch(`/api/receiving/${row.receiving_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoho_purchaseorder_number: next || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          toast.error(data?.error ?? `PO# save failed (${res.status})`);
          return;
        }
        // Optimistic active-line patch — reflect the number (and the unmatched →
        // zoho_po promotion the server just did) instantly, no refetch.
        const patch: Partial<ReceivingLineRow> & { id: number } = {
          id: row.id,
          zoho_purchaseorder_number: next || null,
        };
        if (next && row.receiving_source === 'unmatched') patch.receiving_source = 'zoho_po';
        dispatchLineUpdated(patch);
        toast.success(next ? `PO# saved (${next})` : 'PO# cleared');
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
        window.dispatchEvent(
          new CustomEvent('receiving-package-updated', {
            detail: { receiving_id: row.receiving_id, zoho_purchaseorder_number: next || null },
          }),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'PO# save failed');
      }
    },
    [row.receiving_id, row.id, row.receiving_source],
  );

  return { poEditorOpen, setPoEditorOpen, poNumberEdit, setPoNumberEdit, persistPoNumber };
}

'use client';

/**
 * Unbox Displays → Prebox leaf (Assets group peer of Inventory · Units · Photos).
 *
 * Create prebox label checklist — flush, not nested under Units and not a
 * floating overlay. Visible when the carton has scanned serials.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PreboxWizard, type PreboxWizardSerial } from '@/components/receiving/PreboxWizard';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

function usePreboxSerials(receivingId: number | null) {
  const enabled = typeof receivingId === 'number' && receivingId > 0;
  const { data, isPending } = useQuery<{
    success: boolean;
    receiving_lines: ReceivingLineRow[];
  }>({
    queryKey: receivingSiblingsQueryKey(receivingId ?? 0),
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
      );
      if (!res.ok) throw new Error('Failed to fetch carton siblings');
      return res.json();
    },
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const lines = data?.receiving_lines ?? [];
  const serials: PreboxWizardSerial[] = useMemo(
    () =>
      lines.flatMap((l) =>
        (l.serials ?? []).map((s) => ({
          id: s.id,
          serial_number: s.serial_number,
          unit_uid: s.unit_uid ?? null,
          sku: l.sku ?? null,
        })),
      ),
    [lines],
  );
  const skuSet = new Set(lines.map((l) => (l.sku || '').trim()).filter(Boolean));
  const kitSku = skuSet.size === 1 ? Array.from(skuSet)[0] : null;
  return { enabled, isPending, serials, kitSku, hasSerials: serials.length > 0 };
}

export function PreboxDisplayHost({ receivingId }: { receivingId: number | null }) {
  const { enabled, isPending, serials, kitSku, hasSerials } = usePreboxSerials(receivingId);

  if (!enabled) {
    return (
      <p
        className="px-1 py-6 text-center text-role-caption text-text-soft"
        data-testid="unbox-prebox-display"
      >
        Open a carton to create a prebox label.
      </p>
    );
  }
  if (isPending && serials.length === 0) {
    return (
      <p className="text-role-caption text-text-soft" data-testid="unbox-prebox-display">
        Loading units…
      </p>
    );
  }
  if (!hasSerials) {
    return (
      <p
        className="border-y border-dashed border-border-hairline px-3 py-5 text-center text-role-caption text-text-soft"
        data-testid="unbox-prebox-display"
      >
        Scan serials on this carton before creating a prebox label.
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="unbox-prebox-display">
      <PreboxWizard serials={serials} sku={kitSku} embedded />
    </div>
  );
}

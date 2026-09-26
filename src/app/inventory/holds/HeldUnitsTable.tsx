'use client';

/** Admin › Holds — the CLIENT ISLAND for `/inventory/holds`. */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { HoldReleasePlane } from '@/components/inventory/holds-grid/HoldReleasePlane';
import { resolveAdminHoldsRowActions } from '@/components/inventory/holds-grid/admin-holds-verbs';
import { useAdminHoldsSpreadsheet } from '@/components/inventory/holds-grid/useAdminHoldsSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { HeldUnitRow } from '@/lib/inventory/held-unit-row';

export interface HeldUnitsTableProps {
  rows: HeldUnitRow[];
  /** The page's `releaseAction`. */
  releaseAction: (formData: FormData) => void | Promise<void>;
}

export function HeldUnitsTable({ rows, releaseAction }: HeldUnitsTableProps) {
  const router = useRouter();
  const [releaseTarget, setReleaseTarget] = useState<HeldUnitRow | null>(null);

  /** The binding's `navigate` record plane, wired to the router. */
  const openUnit = useCallback(
    (row: HeldUnitRow) => {
      router.push(`/inventory?unit=${row.id}`);
    },
    [router],
  );

  /** The family's verbs, resolved per row. */
  const rowActions = useCallback(
    (row: HeldUnitRow): readonly CompoundRowAction[] =>
      resolveAdminHoldsRowActions(row, { onRelease: setReleaseTarget }),
    [],
  );

  /** Await the action, then drop the plane: */
  const release = useCallback(
    async (formData: FormData) => {
      await releaseAction(formData);
      setReleaseTarget(null);
    },
    [releaseAction],
  );

  const sheet = useAdminHoldsSpreadsheet({ rows, onOpenRow: openUnit, rowActions });

  return (
    <div className="relative flex h-[60vh] min-h-0 min-w-0 flex-col">
      <DataTable
        {...sheet}
        totalCount={rows.length}
        searchEmptyMessage="No held units match that filter."
      />
      <HoldReleasePlane
        row={releaseTarget}
        onClose={() => setReleaseTarget(null)}
        action={release}
      />
    </div>
  );
}

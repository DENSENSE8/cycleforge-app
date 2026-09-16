'use client';

/**
 * Admin › Holds — the CLIENT ISLAND for `/inventory/holds`.
 *
 * The page is an RSC: it guards, it runs the hold and release server actions,
 * and it reads the units currently in `ON_HOLD`. None of that moves. This file
 * is only the boundary the slot engine needs (hooks, layout cascade, header
 * sort, row verbs), and it takes its rows as props — the SQL stays on the
 * server.
 *
 * Same shape as `../returns/RecentReturnsTable.tsx`: spread the family's feed
 * onto DataTable, and supply the two things a binding cannot hold — the router
 * for the `navigate` record plane, and the handlers behind the family's verbs.
 */

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
  /**
   * The page's `releaseAction`. A server action survives the boundary as a
   * prop, which is what keeps the write on its ONE entrypoint: it re-gates
   * `sku_stock.adjust`, re-resolves the unit inside the caller's org and
   * revalidates this path. A client fetch to a new route would inherit none of
   * that and would be a second way to release a unit.
   */
  releaseAction: (formData: FormData) => void | Promise<void>;
}

export function HeldUnitsTable({ rows, releaseAction }: HeldUnitsTableProps) {
  const router = useRouter();
  const [releaseTarget, setReleaseTarget] = useState<HeldUnitRow | null>(null);

  /**
   * The binding's `navigate` record plane, wired to the router.
   *
   * This is the retired `unit` cell's `<Link>`: the reach-through is declared
   * once on the entity (`ADMINHOLDS_TABLE_BINDING.recordPlane`) and the mount
   * supplies the only thing a binding cannot hold — the router.
   */
  const openUnit = useCallback(
    (row: HeldUnitRow) => {
      router.push(`/inventory?unit=${row.id}`);
    },
    [router],
  );

  /**
   * The family's verbs, resolved per row. The mount supplies the HANDLER only
   * — the verb itself is declared in `admin-holds-verbs.ts`, because a verb
   * declared at a mount is a per-lane action list by another name
   * (`VERBS_BIND_TO_FIELDS`).
   */
  const rowActions = useCallback(
    (row: HeldUnitRow): readonly CompoundRowAction[] =>
      resolveAdminHoldsRowActions(row, { onRelease: setReleaseTarget }),
    [],
  );

  /**
   * Await the action, then drop the plane: the row it names stops being held,
   * so leaving the plane open would leave an operator reading a unit that is
   * already back on the floor. Awaiting inside the form's action keeps
   * `useFormStatus().pending` true for the whole write.
   */
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

'use client';

/**
 * To-ship's **Add order** — the primary CTA at the top right of the desk's page
 * header.
 *
 * Registered into {@link DeskActionSlotRegistrar} rather than rendered here:
 * the header lives in the shared `(desk)` layout, one level above this page,
 * and a shared frame that imported one desk's intake button would stop being
 * shared. Amazon Prep and Labels register nothing and the slot stays empty.
 *
 * One click opens the triage form (`?triage=new`). The Root Index of methods —
 * hand entry, CSV, sync, backfill — is still one step away inside the rail, so
 * making triage the direct target costs the other paths nothing and puts the
 * caged intake at the budget's first interaction.
 *
 * A real DS `Button`, not the 20px band cell it used to be. That cell existed
 * only because the CTA shared a 28px chrome row (`PRIMARY_CHROME_ROW_FACE`)
 * with the tabs and the smallest DS button is 32px. With the CTA on its own
 * page-header row that constraint is gone, and a page-level primary action
 * should look like one — full size, primary tone, a verb phrase for a label
 * ("Add order", not "Add", which never says add WHAT).
 */

import { useMemo } from 'react';
import { Plus } from '@/components/Icons';
import { DeskActionSlotRegistrar } from '@/components/desk/DeskActionSlot';
import { Button } from '@/design-system/primitives';

export function OrdersDeskAddAction({ onAdd }: { onAdd: () => void }) {
  // Memoized: the registrar re-registers whenever this node's identity changes,
  // and a fresh element every render would loop through the provider.
  const button = useMemo(
    () => (
      <Button
        variant="primary"
        size="md"
        radius="pill"
        icon={<Plus aria-hidden />}
        onClick={onAdd}
        data-testid="orders-desk-add"
        className="shrink-0"
      >
        Add order
      </Button>
    ),
    [onAdd],
  );

  return <DeskActionSlotRegistrar>{button}</DeskActionSlotRegistrar>;
}

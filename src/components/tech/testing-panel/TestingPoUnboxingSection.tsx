'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageOpen, Pencil } from '@/components/Icons';
import { WorkspaceCard } from '@/design-system/components';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { LineMatchingSection } from '@/components/receiving/workspace/line-edit/LineMatchingSection';
import { UnfoundMatchStrip } from '@/components/receiving/workspace/line-edit/UnfoundMatchStrip';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { TestingController } from './testing-panel-types';
import { TestingPoItemsSection } from './TestingPoItemsSection';

/**
 * Testing workspace analogue of {@link POUnboxingSection}: one card with PO items
 * on top and the Package Pairing dropdown below.
 *
 * When `suppressItemsHeader` is set (testing tab row owns the pencil), the PO
 * items eyebrow + internal Edit-PO pencil are hidden and pairing is controlled
 * via `pairingOpen` / `onPairingToggle`.
 */
export function TestingPoUnboxingSection({
  row,
  staffId,
  c,
  suppressItemsHeader = false,
  pairingOpen: pairingOpenProp,
  onPairingToggle,
}: {
  row: ReceivingLineRow;
  staffId: string;
  c: TestingController;
  /** Hide "PO items · N" + internal pencil — parent tab row owns them. */
  suppressItemsHeader?: boolean;
  /** Controlled Package-Pairing open state; uncontrolled if omitted. */
  pairingOpen?: boolean;
  onPairingToggle?: () => void;
}) {
  const router = useRouter();
  const [internalPairingOpen, setInternalPairingOpen] = useState(false);
  const pairingOpen = pairingOpenProp ?? internalPairingOpen;
  const togglePairing =
    onPairingToggle ?? (() => setInternalPairingOpen((v) => !v));

  if (row.receiving_id == null) {
    // No carton yet — render only the PO-items block, which now supports serial
    // entry for a carton-less real line (attach-by-line-id). Package pairing +
    // the unfound auto-match strip both need a carton, so they're omitted here.
    return (
      <WorkspaceCard variant="glass" overflow="visible" bodyClassName="space-y-3 p-4">
        <TestingPoItemsSection
          row={row}
          staffId={staffId}
          c={c}
          embedded
          suppressHeader={suppressItemsHeader}
        />
      </WorkspaceCard>
    );
  }

  const receivingId = row.receiving_id;
  // Same gate unbox uses for its auto-match strip + local-receive path
  // (`isUnfound = shouldUseLocalReceiveOnly`): unmatched / return / sales-order
  // cartons. Real Zoho-PO cartons keep the plain (pencil-only) header.
  const unfoundSurface = shouldUseUnmatchedItemsSurface(row);

  const pairingToggleLabel = pairingOpen ? 'Hide package pairing' : 'Show package pairing';
  const headerRight = suppressItemsHeader ? undefined : (
    <div className="flex shrink-0 items-center gap-1.5">
      {unfoundSurface ? (
        <HoverTooltip
          label="Open this carton in unbox (serial scan, photos, receive)"
          asChild
          focusable={false}
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<PackageOpen />}
            onClick={() => router.push(openInUnboxHref(receivingId, row.id))}
            ariaLabel="Open this carton in unbox"
            className="h-7 border-blue-200 bg-blue-50 px-2.5 text-blue-700 hover:bg-blue-100"
          >
            Open in unbox
          </Button>
        </HoverTooltip>
      ) : null}
      <IconButton
        icon={<Pencil className="h-4 w-4" />}
        ariaLabel={pairingToggleLabel}
        title={pairingToggleLabel}
        tone="accent"
        aria-expanded={pairingOpen}
        onClick={togglePairing}
      />
    </div>
  );

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="space-y-3 p-4">
      <div>
        <TestingPoItemsSection
          row={row}
          staffId={staffId}
          c={c}
          embedded
          headerRight={headerRight}
          suppressHeader={suppressItemsHeader}
        />
        {unfoundSurface ? (
          <UnfoundMatchStrip
            receivingId={receivingId}
            trackingNumber={row.tracking_number ?? null}
            showTopRule
          />
        ) : null}
        <LineMatchingSection
          row={row}
          staffId={staffId}
          showOpenInUnbox={false}
          embedded
          collapsed={!pairingOpen}
          // The auto-match strip already draws the divider above pairing when it's
          // shown; only draw our own top rule when there's no strip between them.
          showTopRule={!unfoundSurface}
          hideTicketLinkRow
        />
      </div>
    </WorkspaceCard>
  );
}

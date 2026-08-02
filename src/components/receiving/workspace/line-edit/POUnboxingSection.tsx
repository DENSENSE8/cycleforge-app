'use client';

/**
 * POUnboxingSection — the PO Items + Package-Pairing card.
 *
 * Renders the PO-items accordion by default with the "Edit PO" pencil that
 * reveals Package Pairing. Units-on-carton and Notes/Label are NO LONGER shown
 * here — they are top-level tabs owned by {@link LineEditPanel}'s section
 * switcher (`SectionTabsSlider`). This card is just the "Items" tab body.
 *
 * Auto-match (Quick match) lives inside {@link CartonMatchHub} when the carton
 * is unfound — not a sibling strip.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Pencil } from '@/components/Icons';
import { WorkspaceCard } from '@/design-system/components';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LinePoItemsSection } from './LinePoItemsSection';
import { CartonMatchHub } from './CartonMatchHub';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { InlineActionFeedbackPayload } from '../InlineActionFeedbackCard';
import type { UnboxLineController } from './unbox-line-controller';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';

interface POUnboxingSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  poItems: boolean;
  matching: boolean;
  openInUnbox: boolean;
  editLines: boolean;
  serialScan: boolean;
  c: UnboxLineController;
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  includeLinkedPoItems?: boolean;
  /**
   * Hide the "PO items · N" header + the internal Edit-PO pencil — the parent
   * (the unbox tab row) owns them. Package Pairing is then controlled via
   * `pairingOpen`/`onPairingToggle`. Triage omits this and keeps the header.
   */
  suppressItemsHeader?: boolean;
  /** Controlled Package-Pairing open state; uncontrolled (internal) if omitted. */
  pairingOpen?: boolean;
  onPairingToggle?: () => void;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
}

export function POUnboxingSection({
  row,
  staffId,
  poItems,
  matching,
  openInUnbox,
  editLines,
  serialScan,
  c,
  onItemDescFeedback,
  onItemDescSaved,
  includeLinkedPoItems = true,
  suppressItemsHeader = false,
  pairingOpen: pairingOpenProp,
  onPairingToggle,
  accordionBootstrap = 'default',
}: POUnboxingSectionProps) {
  const receivingId = row.receiving_id ?? null;
  const linkedPo = !c.isUnfound && !shouldUseUnmatchedItemsSurface(row);
  const showPoItems = poItems || (includeLinkedPoItems && matching && linkedPo);
  const showPairing = matching;

  const [internalPairingOpen, setInternalPairingOpen] = useState(false);
  const pairingIsOpen = pairingOpenProp ?? internalPairingOpen;
  const togglePairing = onPairingToggle ?? (() => setInternalPairingOpen((v) => !v));
  const canCollapsePairing = showPoItems && showPairing;
  const pairingCollapsed = canCollapsePairing ? !pairingIsOpen : false;

  const headerRight = useMemo(() => {
    if (suppressItemsHeader) return undefined;
    const parts: ReactNode[] = [];
    if (canCollapsePairing) {
      parts.push(
        <div key="pairing" className="flex shrink-0 items-center gap-1">
          <span className="text-role-eyebrow uppercase leading-none tracking-widest text-text-faint">
            Edit PO
          </span>
          <HoverTooltip label={pairingIsOpen ? 'Hide package pairing' : 'Show package pairing'} asChild>
            <IconButton
              icon={<Pencil className="h-4 w-4" />}
              ariaLabel={pairingIsOpen ? 'Hide package pairing' : 'Show package pairing'}
              tone="accent"
              aria-expanded={pairingIsOpen}
              onClick={togglePairing}
            />
          </HoverTooltip>
        </div>,
      );
    }
    if (parts.length === 0) return undefined;
    return <div className="flex items-center gap-3">{parts}</div>;
  }, [suppressItemsHeader, canCollapsePairing, pairingIsOpen, togglePairing]);

  if (!showPoItems && !showPairing) return null;

  const poItemsSection = (
    <LinePoItemsSection
      row={row}
      staffId={staffId}
      serialScan={serialScan}
      openInUnbox={openInUnbox}
      editLines={editLines}
      c={c}
      embedded
      headerRight={headerRight}
      suppressHeader={suppressItemsHeader}
      onItemDescFeedback={onItemDescFeedback}
      onItemDescSaved={onItemDescSaved}
      accordionBootstrap={accordionBootstrap}
    />
  );

  return (
    <WorkspaceCard
      variant="glass"
      overflow="visible"
      bodyDensity="nested"
      bodyClassName="px-3 pt-3 pb-2"
    >
      <div>
        {showPoItems ? poItemsSection : null}

        {showPairing ? (
          <div className={pairingCollapsed ? undefined : 'mt-3'}>
            <CartonMatchHub
              row={row}
              staffId={staffId}
              tabSet="unbox"
              autoFocusSearch={!openInUnbox}
              showOpenInUnbox={openInUnbox}
              embedded
              collapsed={pairingCollapsed}
              showTopRule={showPoItems}
              autoMatch={
                c.isUnfound
                  ? {
                      receivingId,
                      lineId: row.id ?? null,
                      trackingNumber: row.tracking_number ?? null,
                      receivedSerial: row.serials?.[0]?.serial_number ?? null,
                      providerTicketId: c.providerTicketId,
                      ticketNumber: c.supportTicket?.label ?? null,
                      ticketUrl: c.supportTicket?.openUrl ?? null,
                      onTicketChanged: () => void c.invalidateSupportTicket(),
                    }
                  : null
              }
            />
          </div>
        ) : null}
      </div>
    </WorkspaceCard>
  );
}

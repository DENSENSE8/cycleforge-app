'use client';

import { useState } from 'react';
import { ChevronDown } from '@/components/Icons';
import { getStatusDotBg, workflowStatusTableLabel } from '@/lib/receiving/receiving-constants';
import { ConditionGradeChip, TicketChip, UnitPriceChip, getLast8 } from '@/components/ui/CopyChip';
import { MobileReceivingIdentityChips } from '@/components/mobile/receiving/MobileReceivingIdentityChips';
import { MobileRowPhotoActions, MobileRowPhotoCta } from '@/components/mobile/receiving/MobileRowPhotoActions';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingUnboxedSyncTooltip } from '@/lib/receiving/unboxed-sync-tooltip';
import { buildUnitFields, unitTitle } from '@/components/mobile/receiving/receiving-feed-entries';
import { chipText } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

/**
 * One face for the meta row (qty · price · ticket). Dense chips already use
 * {@link chipText}; qty must share it or the figures read as two sizes.
 */
const META_FACE = chipText;

interface MobileReceivingUnitRowProps {
  row: ReceivingLineRow;
  /** One-shot tint when the line just landed in the feed. */
  fresh?: boolean;
  /**
   * Only the bottom-most (newest) row in the whole feed is expanded — it gets
   * the big photo tile + full-width camera as a third row. Every other row is
   * compact: the gallery + camera live as small icons at the meta row's far
   * right, regardless of whether photos exist.
   */
  expanded?: boolean;
  /**
   * True for items inside a package: PO + tracking live once on the package
   * header, so they're omitted from this row's detail chips to avoid duplication.
   */
  headerSharesPoTracking?: boolean;
  captureHref: string;
  galleryHref: string;
  /** Opens the in-place swipe viewer (preferred on /m/receiving). */
  onOpenGallery?: () => void;
  /** Optional: open the richer carton sheet (wired to the title). */
  onOpenSheet?: () => void;
}

/**
 * Photo-first receiving item row — the per-unit body shared by the package group
 * and the standalone card.
 *
 * - **Expanded** (newest row only): title · meta row · a big photo row (gallery
 *   tile as status + full-width camera). The gallery count uses the same
 *   two-digit slot as recents.
 * - **Compact** (everything else): title · meta row whose far right holds small
 *   gallery + camera icons (priority placement); no third row.
 * All identifiers render through the shared CopyChip family (last-8 + copy on
 * tap), never as raw text. Tapping the dot/qty or the chevron toggles the
 * config-driven detail panel.
 */
export function MobileReceivingUnitRow({
  row,
  fresh = false,
  expanded = false,
  headerSharesPoTracking = false,
  captureHref,
  galleryHref,
  onOpenGallery,
  onOpenSheet,
}: MobileReceivingUnitRowProps) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((v) => !v);

  const title = unitTitle(row);
  const qtyExpected = row.quantity_expected ?? 0;
  const qtyText = `${row.quantity_received}/${row.quantity_expected ?? '?'}`;
  const qtyColor =
    qtyExpected > 1
      ? 'text-text-warning'
      : row.quantity_expected && row.quantity_received >= row.quantity_expected
        ? 'text-emerald-600'
        : 'text-text-muted';

  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');
  const dot = getStatusDotBg(row.workflow_status, row.quantity_received, row.quantity_expected);
  const workflowLabel = workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  const statusDotTip =
    receivingUnboxedSyncTooltip({
      workflowStatus: row.workflow_status,
      inventoryProviderLabel,
    }) ?? workflowLabel;

  const photoCount = Math.max(0, row.photo_count ?? 0);

  const price = (row.unit_price || '').toString().trim();
  const ticketDigits = (row.zendesk_ticket ?? '').trim().replace(/^#/, '');
  const hasTicket = ticketDigits.length > 0;
  const detailFields = buildUnitFields(row);

  return (
    <div
      className={`-mx-1 rounded-mode px-1 transition-colors duration-700 ${
        fresh ? 'bg-surface-sunken' : 'bg-transparent'
      }`}
    >
      {/* Title — opens the richer carton sheet when wired. */}
      <button
        type="button"
        onClick={onOpenSheet}
        disabled={!onOpenSheet}
        className="ds-raw-button block w-full text-left disabled:cursor-default"
      >
        <p className="text-base font-semibold leading-snug text-text-default">{title}</p>
      </button>

      {/* Meta row. Qty + price/ticket can shrink; photo actions never move. */}
      <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="ds-raw-button flex shrink-0 items-center gap-2 text-left"
        >
          <HoverTooltip label={statusDotTip} asChild focusable={false}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
          </HoverTooltip>
          <span className={cn('shrink-0', META_FACE, qtyColor)}>{qtyText}</span>
        </button>

        {/* Price (always) + reserved ticket slot: a filed ticket fills the
            slot instead of growing the row, so gallery/camera stay pinned.
            Qty · price · ticket all use {@link chipText}. */}
        <div className={cn('flex min-w-0 flex-1 items-center gap-1 overflow-hidden', META_FACE)}>
          <UnitPriceChip amount={price || null} dense />
          <span
            className={hasTicket ? 'shrink-0' : 'invisible pointer-events-none shrink-0'}
            aria-hidden={!hasTicket}
          >
            <TicketChip
              value={hasTicket ? ticketDigits : '00000000'}
              display={hasTicket ? getLast8(ticketDigits) : '00000000'}
              displayWidth="last8"
              dense
              disableTooltip={!hasTicket}
            />
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Expand chevron sits LEFT of the gallery/camera; photo actions stay
              right-most for priority. */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? 'Hide details' : 'Show details'}
            className="ds-raw-button inline-flex h-7 w-7 items-center justify-center text-text-faint"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {!expanded ? (
            <MobileRowPhotoActions
              photoCount={photoCount}
              galleryHref={galleryHref}
              captureHref={captureHref}
              onOpenGallery={onOpenGallery}
            />
          ) : null}
        </div>
      </div>

      {/* Detail panel — identifiers as CopyChips + config-driven text fields. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? 'mt-2 grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {/* The "more information" cluster: SKU + condition (moved off the main
              row) plus PO + tracking + serial. PO + tracking are omitted for
              package items (shown once on the package header) so nothing dupes. */}
          <div className="flex flex-wrap items-center gap-2 px-0.5 pb-1">
            {/* No serial chip: a line's serials render as ONE comma-joined
                value, so a multi-unit carton turns this row into a wall of
                digits. Serials stay on the per-unit surfaces that can show
                them one at a time. */}
            <MobileReceivingIdentityChips
              row={row}
              includePo={!headerSharesPoTracking}
              includeTracking={!headerSharesPoTracking}
              sku={row.sku}
              po={row.zoho_purchaseorder_number || row.zoho_purchaseorder_id}
              className="flex flex-wrap items-center gap-2"
            />
            <ConditionGradeChip grade={row.condition_grade} />
          </div>
          {detailFields.length ? (
            <dl className="divide-y divide-border-hairline rounded-mode border border-border-hairline bg-surface-canvas/60">
              {detailFields.map((f) => (
                <div key={f.k} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">{f.k}</dt>
                  <dd className="min-w-0 truncate text-role-caption font-semibold text-text-muted">{f.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      {/* Photo row — expanded (newest) only: gallery tile + full-width camera. */}
      {expanded ? (
        <MobileRowPhotoCta
          className="mt-3"
          photoCount={photoCount}
          captureHref={captureHref}
          galleryHref={galleryHref}
          onOpenGallery={onOpenGallery}
        />
      ) : null}
    </div>
  );
}

'use client';

/**
 * Inventory › Stock — the **selection action strip**: adjust the count, move a
 * SKU to another location, delete the pairing.
 *
 * ## Where it paints
 *
 * Portaled into {@link SLOT_TABLE_ACTION_ROW_ATTR} (`data-slot-table-action-row`),
 * the in-flow `empty:hidden` guest `LedgerGrid` stamps UNDER the column labels.
 * Armed it grows and pushes the rows; idle the slot collapses to nothing. The
 * column labels stay visible and the search toolbar is never covered — the same
 * band and the same law the To-ship strip obeys (`MorphingRowActionMenu`,
 * `SLOT_TABLE_PAINT_LAW.ordersActions`).
 *
 * **Selection dismisses it, not an outside click.** Clicking off either side of
 * the table leaves it pinned under the header while the sheet scrolls; the
 * strip goes away when the last row is unticked — which is what `onClear` does
 * for Escape and after a landed move or delete.
 *
 * ## The split
 *
 * - {@link useStockVerbStrip} — the drafts, the in-flight guard and the three
 *   commits (which endpoint each verb writes, and why).
 * - {@link StockVerbRow} / {@link StockAdjustRow} / {@link StockMoveRow} — the
 *   three faces this band morphs between.
 * - This file — the portal, the key bindings, and which row is showing.
 *
 * **No confirm step.** Picking commits. Delete is the one exception and it is
 * still not a confirm BUTTON: the same button re-labels and takes a second
 * press, so an irreversible verb cannot fire on a mis-click without adding a
 * control to the strip.
 *
 * ## No keycaps
 *
 * `a` / `m` / `d` are bound while the strip is armed and the letters ride
 * `aria-keyshortcuts`; the faces stay clean. That is the To-ship strip's
 * arrangement and the shortcut cohort's standing rule — a letter painted on a
 * resting Button is a refusal (`shortcut-display-cohort.ts`).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  SLOT_TABLE_ACTION_ROW_ATTR,
  SLOT_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/slot-table-overlay-host';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { useFixedBandHeight } from '@/hooks/useFixedBandHeight';
import {
  SLOT_TABLE_ACTION_BAR_BAND_CLASS,
  SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
} from '@/lib/tables/slot-table-action-bar-law';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import {
  stockReplacementLabel,
  stockReplacementSourceFace,
} from '@/lib/inventory/stock-sku-replacement';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import { useLocationPickerOptions } from './useLocationPickerOptions';
import { StockAdjustRow } from './StockAdjustRow';
import { StockMoveRow } from './StockMoveRow';
import { StockVerbRow } from './StockVerbRow';
import { StockReplaceRow } from './StockReplaceRow';
import { useStockVerbStrip } from './useStockVerbStrip';

export interface StockActionBarProps {
  /** The picked rows — `useLocationStockSelection`'s output. */
  rows: readonly LocationStockTableRow[];
  /** Drop the selection, which is what dismisses the strip. */
  onClear: () => void;
  /** Re-read the server feed once a write lands. */
  onCommitted: () => void;
}

export function StockActionBar({ rows, onClear, onCommitted }: StockActionBarProps) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const strip = useStockVerbStrip({
    rows,
    staffId: staffId > 0 ? staffId : undefined,
    onClear,
    onCommitted,
  });
  const { options: locationOptions, loading: locationsLoading } = useLocationPickerOptions();

  /**
   * The replacement TARGET list — the same Zoho catalog search the intake
   * composer pairs from, so a product reads identically wherever it is picked.
   *
   * Two exclusions, both of them refusals the endpoints make anyway: the SKU
   * the rows already carry, and every other `TMP-…` placeholder (chaining one
   * placeholder onto another is `target-is-provisional`). Offering a row that
   * can only 409 is worse than a shorter list.
   */
  const [targetQuery, setTargetQuery] = useState('');
  const { data: skuHits = [], isFetching: skuFetching } = useSkuCatalogSearch(targetQuery, {
    searchField: 'zoho_catalog',
    limit: 20,
    allowEmpty: true,
  });
  const sourceSku = strip.replacement.sourceSku;
  const targetOptions = useMemo(
    () =>
      skuHits
        .filter((hit) => hit.sku !== sourceSku && !isProvisionalSku(hit.sku))
        .map((hit) => ({
          value: hit.sku,
          label: hit.product_title?.trim() || hit.sku,
          meta: hit.sku,
          data: hit,
        })),
    [skuHits, sourceSku],
  );

  const anchorRef = useRef<HTMLSpanElement>(null);
  /**
   * The band, measured. `useFixedBandHeight` is the law's RUNTIME half: static
   * analysis cannot prove a React tree has constant height, so this fails
   * loudly in dev the first time the number moves.
   */
  const bandRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useFixedBandHeight(bandRef, {
    label: 'Stock action bar',
    expectedPx: SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
  });

  /**
   * Find the guest slot inside THIS grid. `closest` from the anchor rather than
   * a bare `document.querySelector`, so a second mounted grid on the same route
   * cannot capture the strip.
   */
  useLayoutEffect(() => {
    const grid = anchorRef.current?.closest(`[${SLOT_TABLE_OVERLAY_HOST_ATTR}]`);
    const found = grid?.querySelector(`[${SLOT_TABLE_ACTION_ROW_ATTR}]`);
    setSlot(found instanceof HTMLElement ? found : null);
  }, []);

  /**
   * Verbs are one letter each while the strip is armed, and Escape steps back
   * one level: out of a verb row to the verbs, out of the verbs to no
   * selection (which is what dismisses the strip).
   */
  const { view, backToActions, openAdjust, openMove, openReplace, runDelete } = strip;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (view !== 'actions') backToActions();
        else onClear();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isEditableKeyTarget(event.target)) return;
      if (view !== 'actions') return;
      const letter = event.key.length === 1 ? event.key.toLowerCase() : '';
      if (letter === 'a') openAdjust();
      else if (letter === 'm') openMove();
      else if (letter === 'r') openReplace();
      else if (letter === 'd') runDelete();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [backToActions, onClear, openAdjust, openMove, openReplace, runDelete, view]);

  const band = (
    <div
      ref={bandRef}
      role="toolbar"
      aria-label="Stock row actions"
      data-testid="stock-action-bar"
      data-view={view}
      // The BAND declares the height — `slot-table-action-bar-law.ts`. It was
      // `flex-wrap … py-2`, which made the height whatever the tallest child
      // happened to be and turned "one more control appeared" into a two-row
      // toolbar. `flex-nowrap` + `overflow-hidden` mean an oversized child
      // CLIPS instead of resizing the band: a visible bug a reviewer fixes,
      // not an invisible one the operator eats mid-press.
      className={SLOT_TABLE_ACTION_BAR_BAND_CLASS}
    >
      {view === 'actions' ? (
        <StockVerbRow
          selectedCount={rows.length}
          targetCount={strip.targets.length}
          writable={strip.writable}
          remainder={strip.plan.note}
          error={strip.error}
          busy={strip.busy}
          deleteArmed={strip.deleteArmed}
          onAdjust={strip.openAdjust}
          onMove={strip.openMove}
          replaceLabel={stockReplacementLabel(strip.replacement.kind)}
          replaceBlocked={strip.replacement.blocked}
          pairing={strip.replacement.kind === 'pair'}
          onReplace={strip.openReplace}
          onDelete={strip.runDelete}
        />
      ) : view === 'adjust' ? (
        <StockAdjustRow
          direction={strip.direction}
          onDirectionChange={strip.setDirection}
          qtyDraft={strip.qtyDraft}
          onQtyDraftChange={strip.setQtyDraft}
          qty={strip.qty}
          reason={strip.reason}
          onReasonChange={strip.setReason}
          note={strip.note}
          onNoteChange={strip.setNote}
          onHand={strip.single ? strip.single.qty : null}
          targetCount={strip.targets.length}
          ready={strip.adjustReady}
          busy={strip.busy}
          error={strip.error}
          onBack={strip.backToActions}
          onCommit={strip.runAdjust}
        />
      ) : view === 'move' ? (
        <StockMoveRow
          sourceFace={strip.single ? strip.single.face : null}
          onHand={strip.single ? strip.single.qty : null}
          targetCount={strip.targets.length}
          destination={strip.destination}
          onDestinationChange={strip.setDestination}
          options={locationOptions}
          optionsLoading={locationsLoading}
          qtyDraft={strip.qtyDraft}
          onQtyDraftChange={strip.setQtyDraft}
          qty={strip.moveQty}
          ready={strip.moveReady}
          busy={strip.busy}
          error={strip.error}
          onBack={strip.backToActions}
          onCommit={strip.runMove}
        />
      ) : (
        <StockReplaceRow
          plan={strip.replacement}
          sourceFace={stockReplacementSourceFace(strip.replacement)}
          options={targetOptions}
          optionsLoading={skuFetching}
          onSearchChange={setTargetQuery}
          targetSku={strip.targetSku}
          onTargetChange={(sku, title) => {
            strip.setTargetSku(sku);
            strip.setTargetTitle(title);
          }}
          targetRefusal={strip.targetRefusal}
          qtyDraft={strip.qtyDraft}
          onQtyDraftChange={strip.setQtyDraft}
          qty={strip.moveQty}
          ready={strip.replaceReady}
          busy={strip.busy}
          error={strip.error}
          onBack={strip.backToActions}
          onCommit={strip.runReplace}
        />
      )}
    </div>
  );

  return (
    <>
      {/* The portal's anchor: `closest` needs an element inside this grid, and
          the band itself renders into the header's guest slot. */}
      <span ref={anchorRef} aria-hidden className="hidden" />
      {slot ? createPortal(band, slot) : null}
    </>
  );
}

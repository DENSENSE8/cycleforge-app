'use client';

/**
 * Inventory › Stock — the **desktop pairing composer**: pick a location, pick
 * the Zoho product, say how many, commit.
 *
 * ## The same job the phone already does, at a desk
 *
 * Pairing a product to a place is a FLOOR verb and it shipped on the phone
 * first (`SURFACE_LAW`): `/m/pair/[code]` chooses the product for a scanned
 * empty location and `/m/pair/[code]/[sku]` takes the count and commits. That
 * is the primary path and it stays the primary path — a scan gun holding a bin
 * label is faster than any combobox.
 *
 * This is the same job for the operator who is NOT on the floor: receiving a
 * pallet into a known bay from a desk, or correcting a pairing somebody typed
 * wrong. Operator 2026-09-15: *"two ways — one on mobile, SKU and an empty
 * location ID QR code, then pair the product; and on desktop to pair the
 * product with the SKU and location id."*
 *
 * ## One write, not a second one
 *
 * It PATCHes the identical endpoint the phone does —
 * `PATCH /api/locations/[barcode]` with `action: 'put'` — so the ledger entry,
 * the `sku_stock` recompute and the inventory event are the same on both
 * surfaces. A desk-only insert path would be a second way for stock to come
 * into existence, and the two would drift on exactly the facts a cycle count
 * later disagrees about.
 *
 * `put` ADDS to what is already there rather than replacing it, which is what
 * the phone's qty screen documents and what an operator holding stock means.
 * The on-hand figure is shown beside the projection so the sum is visible
 * before Commit.
 *
 * ## Why the location list is barcodes only
 *
 * The write is keyed by BARCODE (`getLocationByBarcode`), because that is what
 * a gun reads and what every other caller of this endpoint has. That list is
 * {@link useLocationPickerOptions} — shared with the action strip's MOVE verb,
 * which writes the same endpoints and must offer the same places.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { useAuth } from '@/contexts/AuthContext';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { SLOT_TABLE_ACTION_BAR_BAND_CLASS } from '@/lib/tables/slot-table-action-bar-law';
import { stockQtyDraft, StockStripInput } from './stock-verb-row-parts';
import { useLocationPickerOptions } from './useLocationPickerOptions';


/** One `bin_contents` row as `GET /api/locations/[barcode]` reports it. */
interface LocationContentRow {
  sku: string;
  qty: number | string | null;
}

export interface StockPairComposerProps {
  /** Close the composer — the CTA toggles it, Escape and Cancel close it. */
  onClose: () => void;
  /** Re-read the server feed after a commit lands. */
  onCommitted: () => void;
}

export function StockPairComposer({ onClose, onCommitted }: StockPairComposerProps) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;

  const [barcode, setBarcode] = useState<string | null>(null);
  const [sku, setSku] = useState<string | null>(null);
  const [skuQuery, setSkuQuery] = useState('');
  const [qtyDraft, setQtyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  const { options: locationOptions, loading: locationsLoading } = useLocationPickerOptions();

  /**
   * `zoho_catalog` is the Zoho `items` mirror — Zoho SKU + Zoho name, matched
   * in one query. That is the catalog the operator means by "the Zoho product",
   * and it is the same source the phone's pairing search uses.
   */
  const { data: skuHits = [], isFetching: skuFetching } = useSkuCatalogSearch(skuQuery, {
    searchField: 'zoho_catalog',
    limit: 20,
    allowEmpty: true,
  });

  /**
   * Keep the PICKED sku present in `options` regardless of the live query —
   * the field resolves its trigger label out of that array, so a selection
   * would blank itself the moment the operator typed something else.
   */
  const [pickedSku, setPickedSku] = useState<SkuCatalogItem | null>(null);
  const skuOptions = useMemo(() => {
    const rows = pickedSku && !skuHits.some((h) => h.sku === pickedSku.sku)
      ? [pickedSku, ...skuHits]
      : skuHits;
    return rows.map((hit) => ({
      value: hit.sku,
      label: hit.product_title?.trim() || hit.sku,
      meta: hit.sku,
      data: hit,
    }));
  }, [pickedSku, skuHits]);

  /** What is already at this (location, sku) — the sum has to be visible. */
  const { data: onHand = 0 } = useQuery<number>({
    queryKey: ['stock-pair-onhand', barcode, sku],
    enabled: Boolean(barcode && sku),
    queryFn: async () => {
      const res = await fetch(`/api/locations/${encodeURIComponent(barcode as string)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return 0;
      const json = (await res.json()) as { contents?: LocationContentRow[] };
      const row = (json.contents ?? []).find((r) => r.sku === sku);
      return Number(row?.qty) || 0;
    },
  });

  const qty = useMemo(() => {
    const parsed = parseInt(qtyDraft, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [qtyDraft]);

  const ready = Boolean(barcode) && Boolean(sku) && qty > 0 && !busy;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commit = useCallback(async () => {
    if (!ready || !barcode || !sku) return;
    setBusy(true);
    setError(null);
    setOkNote(null);
    try {
      const idempotencyKey = safeRandomUUID();
      const res = await fetch(`/api/locations/${encodeURIComponent(barcode)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          action: 'put',
          sku,
          qty,
          staffId: staffId > 0 ? staffId : undefined,
          // The same reason code the phone's pairing commit sends, so the two
          // surfaces read as one verb in the ledger rather than two.
          reason: 'BIN_ADD',
          clientEventId: idempotencyKey,
        }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Stay OPEN and keep the location: filling a bay is a run of pairings
      // against the same place, which is the same reason the phone's candidate
      // list leads with the room's own products. Only the product and the count
      // reset, so the next Commit cannot silently repeat the last one.
      setOkNote(`Added ${qty} × ${sku}`);
      setSku(null);
      setPickedSku(null);
      setSkuQuery('');
      setQtyDraft('');
      onCommitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add stock');
    } finally {
      setBusy(false);
    }
  }, [barcode, onCommitted, qty, ready, sku, staffId]);

  return (
    <div
      data-testid="stock-pair-composer"
      // Same band, same law as the action strip it shares this slot with
      // (`slot-table-action-bar-law.ts`). It was `flex-wrap … py-2`, which
      // sized the band from its tallest child.
      className={cn('shrink-0', SLOT_TABLE_ACTION_BAR_BAND_CLASS)}
    >
      <Plus className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />

      <SearchableSelectField
        value={barcode}
        onChange={(next) => {
          setBarcode(next == null ? null : String(next));
          setOkNote(null);
          setError(null);
        }}
        options={locationOptions}
        loading={locationsLoading}
        placeholder="Location"
        searchPlaceholder="Bin code, name or room…"
        emptyMessage="No matching location"
        ariaLabel="Location to add stock to"
        autoFocus
        className="w-56"
        testId="stock-pair-location"
      />

      <SearchableSelectField
        value={sku}
        onChange={(next, option) => {
          setSku(next == null ? null : String(next));
          setPickedSku((option?.data as SkuCatalogItem | undefined) ?? null);
          setOkNote(null);
          setError(null);
        }}
        options={skuOptions}
        // Remote mode: the Zoho catalog is thousands of rows, so the server
        // filters and this field must stop filtering the page it was handed.
        onSearchChange={setSkuQuery}
        loading={skuFetching}
        placeholder="Zoho product"
        searchPlaceholder="Product title or SKU…"
        emptyMessage="No matching product"
        ariaLabel="Product to pair"
        className="w-80"
        testId="stock-pair-sku"
      />

      {/*
        The SHARED strip cell — the hand-rolled twin that stood here is now
        `StockStripInput`, so the composer and the three verb rows cannot drift
        on height, padding or focus ring. Why it is a raw input rather than
        `TextField` is documented there.
      */}
      <StockStripInput
        value={qtyDraft}
        onChange={(next) => {
          setQtyDraft(stockQtyDraft(next));
          setOkNote(null);
          setError(null);
        }}
        onEnter={ready ? () => void commit() : undefined}
        placeholder="Qty"
        ariaLabel="Quantity to add"
        testId="stock-pair-qty"
        widthClass="w-16"
        numeric
      />

      {/*
        The SUM, not just the addend. A putaway that adds is indistinguishable
        from one that replaces until the next cycle count disagrees, so the
        projection is on screen before Commit — the same rule the phone's qty
        screen states.
      */}
      {barcode && sku ? (
        <span className="shrink-0 text-role-caption tabular-nums text-text-muted">
          {onHand} → <span className="font-semibold text-text-default">{onHand + qty}</span>
        </span>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error ? (
          <span role="alert" className="text-role-caption font-semibold text-text-danger">
            {error}
          </span>
        ) : okNote ? (
          <span role="status" className="text-role-caption text-text-muted">
            {okNote}
          </span>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Close
        </Button>
        <Button variant="primary" size="sm" disabled={!ready} onClick={() => void commit()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? 'Adding…' : 'Add stock'}
        </Button>
      </div>
    </div>
  );
}

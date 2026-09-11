'use client';

/**
 * Empty / paired location Card on the `/m/scan` identification kernel.
 *
 * WMS job: scan or type a location → if empty, search Zoho catalog (title or
 * SKU) → pick a hit → Square-style qty keypad → PATCH put into `bin_contents`
 * (registering the `locations` row first when the sticker was never printed into
 * the table). Paired: adjust with the same keypad, unpair (take entire qty), or
 * change to another SKU.
 *
 * Search rows mirror the shipping exceptions catalog face: Zoho image left,
 * product title, SKU as subtitle — via {@link ItemRecordThumb} + zoho_catalog.
 *
 * Callers: MobileScanIdentify only. APIs: GET/PATCH /api/locations/[barcode],
 * POST /api/locations/register, GET /api/sku-catalog/search?searchField=zoho_catalog.
 * Schemas: LocationsPatchBody (put/take). User: pair Zoho SKU to location with
 * keypad stock add/subtract and full unpair reversibility.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Search, X } from '@/components/Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import {
  BinStockNumpadSheet,
  type BinNumpadRow,
} from '@/components/sku/BinStockNumpadSheet';
import { useAuth } from '@/contexts/AuthContext';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { useKeyboard } from '@/hooks/useKeyboard';
import {
  locationCode,
  parseLocationCodeFlat,
  unwrapScannedLocation,
  type LocationSegments,
} from '@/lib/barcode-routing';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { MobileStationSheet } from '@/components/mobile/station/MobileStationSheet';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';

export type LocationBindContent = {
  sku: string;
  qty: number;
  productTitle: string | null;
  imageUrl?: string | null;
};

export type LocationBindSnapshot = {
  code: string;
  face: string;
  contents: LocationBindContent[];
};

type Phase = 'search' | 'paired';

function faceFor(code: string): string {
  const segs = parseLocationCodeFlat(code);
  return segs ? locationCode(segs) : code;
}

async function ensureRegistered(code: string, segs: LocationSegments): Promise<void> {
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.ok) return;
  if (res.status !== 404) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Location lookup failed (${res.status})`);
  }
  // Sticker scanned before print-register — mint the row under Zone {letter}.
  await registerLocations(`Zone ${segs.zone}`, [segs]);
}

async function fetchOccupancy(code: string): Promise<LocationBindContent[]> {
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Failed to load location (${res.status})`);
  }
  const json = (await res.json()) as {
    contents?: Array<{
      sku?: string;
      qty?: number;
      productTitle?: string | null;
    }>;
  };
  return (json.contents ?? [])
    .filter((c) => Number(c.qty) > 0 && c.sku)
    .map((c) => ({
      sku: String(c.sku),
      qty: Number(c.qty) || 0,
      productTitle: c.productTitle ?? null,
      imageUrl: null,
    }));
}

export function MobileLocationBindSheet({
  rawCode,
  initialContents,
  onClose,
  onChanged,
}: {
  rawCode: string;
  initialContents: LocationBindContent[];
  onClose: () => void;
  onChanged: (snap: LocationBindSnapshot) => void;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const code = unwrapScannedLocation(rawCode);
  const segs = parseLocationCodeFlat(code);
  const face = faceFor(code);
  const { keyboardHeight } = useKeyboard({ threshold: 80 });

  const [contents, setContents] = useState<LocationBindContent[]>(initialContents);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingSku, setPendingSku] = useState<SkuCatalogItem | null>(null);
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadMode, setNumpadMode] = useState<'plus' | 'minus'>('plus');
  const [numpadRow, setNumpadRow] = useState<BinNumpadRow | null>(null);

  const phase: Phase = contents.length > 0 && !pendingSku ? 'paired' : 'search';
  const primary = contents[0] ?? null;

  const { data: hits = [], isFetching } = useSkuCatalogSearch(query, {
    limit: 24,
    searchField: 'zoho_catalog',
  });

  useEffect(() => {
    setContents(initialContents);
  }, [initialContents, rawCode]);

  const publish = useCallback(
    (next: LocationBindContent[]) => {
      setContents(next);
      onChanged({ code, face, contents: next });
    },
    [code, face, onChanged],
  );

  const refresh = useCallback(async () => {
    const next = await fetchOccupancy(code);
    const withImages = next.map((row) => {
      const prior = contents.find((c) => c.sku === row.sku);
      return prior?.imageUrl ? { ...row, imageUrl: prior.imageUrl } : row;
    });
    publish(withImages);
    return withImages;
  }, [code, contents, publish]);

  const openPutKeypad = useCallback((item: SkuCatalogItem) => {
    setPendingSku(item);
    setNumpadMode('plus');
    setNumpadRow({
      sku: item.sku,
      qty: 0,
      productTitle: item.product_title,
    });
    setNumpadOpen(true);
    setError(null);
  }, []);

  const openAdjustKeypad = useCallback(
    (mode: 'plus' | 'minus') => {
      if (!primary) return;
      setPendingSku(null);
      setNumpadMode(mode);
      setNumpadRow({
        sku: primary.sku,
        qty: primary.qty,
        productTitle: primary.productTitle,
      });
      setNumpadOpen(true);
      setError(null);
    },
    [primary],
  );

  const ensureThenReady = useCallback(async () => {
    if (!segs) throw new Error('Invalid location code');
    await ensureRegistered(code, segs);
  }, [code, segs]);

  const unpair = useCallback(async () => {
    if (!primary || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureThenReady();
      const idempotencyKey = safeRandomUUID();
      const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          action: 'take',
          sku: primary.sku,
          qty: primary.qty,
          staffId,
          reason: 'BIN_UNPAIR',
          clientEventId: idempotencyKey,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Unpair failed (${res.status})`);
      }
      publish([]);
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unpair failed');
    } finally {
      setBusy(false);
    }
  }, [busy, code, ensureThenReady, primary, publish, staffId]);

  const invalidateKey = useMemo(() => ['mobile-location-bind', code] as const, [code]);

  const onNumpadSuccess = useCallback(
    async (nextQty: number) => {
      const sku = numpadRow?.sku;
      const title =
        pendingSku?.product_title ??
        numpadRow?.productTitle ??
        primary?.productTitle ??
        null;
      const imageUrl = pendingSku?.image_url ?? primary?.imageUrl ?? null;
      if (sku && nextQty > 0) {
        publish([{ sku, qty: nextQty, productTitle: title, imageUrl }]);
      } else {
        await refresh();
      }
      setPendingSku(null);
      setNumpadOpen(false);
      setNumpadRow(null);
    },
    [numpadRow, pendingSku, primary, publish, refresh],
  );

  useEffect(() => {
    if (!numpadOpen || !segs) return;
    void ensureRegistered(code, segs).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not register location');
    });
  }, [numpadOpen, code, segs]);

  if (!segs) {
    return (
      <div className="shrink-0 border-t border-border-soft bg-surface-card p-3">
        <p className="text-role-caption text-text-danger">
          Not a location address. Use zone-aisle-bay-level-position (e.g. C-01-01-1-01).
        </p>
        <Button variant="secondary" size="md" className="mt-2 min-h-11" onClick={onClose}>
          Back to scan
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className="shrink-0"
        style={phase === 'search' ? { marginBottom: keyboardHeight } : undefined}
      >
        <MobileStationSheet
          label={`Location ${face}`}
          collapsedLabel="Location"
          open
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
          heightClass={phase === 'search' ? 'h-auto max-h-[55svh]' : 'h-auto'}
          surfaceClass="bg-surface-card"
          showGrabBar={false}
        >
          <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
            <div className="flex items-center gap-2">
              <IconButton
                type="button"
                size="md"
                radius="flush"
                ariaLabel="Close location"
                icon={<X className="h-4 w-4" />}
                onClick={onClose}
                className="shrink-0 text-text-muted hover:text-text-default"
              />
              <div className="min-w-0 flex-1">
                <p className={cn('text-role-eyebrow text-text-soft', STATION_EYEBROW_CLASS)}>
                  {phase === 'paired' ? 'Paired location' : 'Empty location'}
                </p>
                <p className="truncate font-mono text-sm font-semibold text-text-default">
                  {face}
                </p>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-role-caption text-text-danger">
                {error}
              </p>
            )}

            {phase === 'paired' && primary ? (
              <div className="space-y-3">
                <div
                  className={cn(
                    'flex gap-3 border border-border-soft bg-surface-canvas p-2',
                    cornerClass('surface'),
                  )}
                >
                  <ItemRecordThumb imageUrl={primary.imageUrl} className="h-16 w-16 self-center" />
                  <div className="min-w-0 flex-1 self-center">
                    <p className="line-clamp-2 text-sm font-semibold text-text-default">
                      {primary.productTitle?.trim() || primary.sku}
                    </p>
                    <p className="mt-0.5 font-mono text-role-caption text-text-soft">
                      {primary.sku}
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-text-default">
                      qty {primary.qty}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="min-h-11"
                    onClick={() => openAdjustKeypad('minus')}
                  >
                    − Stock
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    className="min-h-11"
                    onClick={() => openAdjustKeypad('plus')}
                  >
                    + Stock
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void unpair()}
                  >
                    {busy ? '…' : 'Pair another'}
                  </Button>
                  <Button
                    type="button"
                    variant="dangerSoft"
                    size="md"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void unpair()}
                  >
                    {busy ? 'Unpairing…' : 'Unpair'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex max-h-[42svh] flex-col gap-2">
                <TextField
                  value={query}
                  onChange={setQuery}
                  label="Search SKU or title"
                  autoFocus
                  inputMode="search"
                  autoComplete="off"
                  trailing={
                    isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                    ) : (
                      <Search className="h-4 w-4 text-text-muted" />
                    )
                  }
                />
                <ul
                  className="min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto border border-border-soft bg-surface-canvas"
                  role="listbox"
                  aria-label="Zoho catalog matches"
                >
                  {query.trim() && !isFetching && hits.length === 0 && (
                    <li className="px-3 py-4 text-center text-role-caption text-text-soft">
                      No Zoho matches
                    </li>
                  )}
                  {!query.trim() && (
                    <li className="flex flex-col items-center gap-2 px-3 py-6 text-center text-text-soft">
                      <Package className="h-6 w-6 text-text-faint" aria-hidden />
                      <span className="text-role-caption">
                        Type a SKU or product title to pair this location
                      </span>
                    </li>
                  )}
                  {hits.map((hit) => (
                    <li key={`${hit.id}-${hit.sku}`}>
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-stretch gap-3 px-2 py-2 text-left active:bg-surface-hover"
                        onClick={() => openPutKeypad(hit)}
                      >
                        <ItemRecordThumb
                          imageUrl={hit.image_url}
                          className="h-14 w-14 self-center"
                        />
                        <span className="min-w-0 flex-1 self-center">
                          <span className="line-clamp-2 block text-sm font-semibold text-text-default">
                            {hit.product_title || hit.sku}
                          </span>
                          <span className="mt-0.5 block font-mono text-role-caption text-text-soft">
                            {hit.sku}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </MobileStationSheet>
      </div>

      <BinStockNumpadSheet
        open={numpadOpen}
        onClose={() => {
          setNumpadOpen(false);
          setPendingSku(null);
          setNumpadRow(null);
        }}
        binBarcode={code}
        row={numpadRow}
        invalidateKey={invalidateKey}
        defaultMode={numpadMode}
        onSuccess={(nextQty) => {
          void onNumpadSuccess(nextQty);
        }}
      />
    </>
  );
}

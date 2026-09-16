'use client';

/**
 * Empty / paired location Card on the `/m/scan` identification kernel.
 *
 * WMS job: scan or type a location → if empty, search Zoho catalog (title or
 * SKU) → pick a hit → keypad the opening quantity → PATCH put into
 * `bin_contents` (registering the `locations` row first when the sticker was
 * never printed into the table). Paired: correct the count in place.
 *
 * ## Correcting a count is one tap
 *
 * The paired face used to be a read-only card over a 2×2 button grid whose
 * only stock path was a FULLSCREEN keypad: `− Stock` → `1` → `Confirm` → back
 * = four taps and a context swap to move one unit. Most floor corrections are
 * ±1 or ±2, so the common case paid the cost of the rare one.
 *
 * Now every paired SKU carries {@link LocationQtyStrip}: `−`, the live count,
 * `+`, and a narrow `123` key that escalates to the keypad for a typed number.
 * One tap, no navigation, repeatable. Taps coalesce into ONE write per burst
 * ({@link useBinQtyCommit}) — six taps are one `put 6`, not six ledger rows.
 *
 * The quick path carries no reason picker: it commits the API's own
 * `BIN_ADD` / `BIN_PULL` defaults, because a reason that `requires_note` or
 * `requires_photo` cannot be satisfied by a single tap. Reasons live on the
 * keypad, where there is room to answer for one.
 *
 * ## Height is fixed, deliberately
 *
 * `MobileScanIdentify` swaps the camera panel for this sheet in the SAME slot
 * of `MobileStationShell`, and `STATION_SHEET_HEIGHT_CLASS` exists so the tape
 * above does not jump when it does. The empty face is a one-line fact plus a
 * hand-off — it no longer hosts a search field, so it fits the fixed height
 * with room to spare.
 *
 * ## Freshness on return needs no listener
 *
 * The pair and qty routes change what is in the bin, but returning to
 * `/m/scan` remounts this page (App Router unmounts page components on
 * navigation — verified: back shows the camera, not a surviving sheet), and a
 * fresh scan re-fetches occupancy anyway. Cross-device drift while the tab
 * sits foregrounded is the one unhandled case; the fix if it ever bites is
 * moving `contents` under the react-query key the qty page already
 * invalidates, not an event listener here.
 *
 * Callers: MobileScanIdentify only. APIs: GET/PATCH /api/locations/[barcode],
 * POST /api/locations/register, GET /api/sku-catalog/search?searchField=zoho_catalog.
 * Schemas: LocationsPatchBody (put/take). User: pair Zoho SKU to location, then
 * correct its count in one tap with full unpair reversibility.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { vibrateScan } from '@/lib/scan-feedback/play';
import {
  locationCode,
  parseLocationCodeFlat,
  unwrapScannedLocation,
} from '@/lib/barcode-routing';
import { cn } from '@/utils/_cn';
import { MobileStationSheet } from '@/components/mobile/station/MobileStationSheet';
import { STATION_SHEET_HEIGHT_CLASS } from '@/components/mobile/station/station-metrics';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import { LocationQtyStrip } from './LocationQtyStrip';
import { useBinQtyCommit } from './use-bin-qty-commit';
import { ensureRegistered, unpairSku } from './location-bind-api';
import type { LocationBindContent, LocationBindSnapshot } from './location-bind-types';

type Phase = 'search' | 'paired';

function faceFor(code: string): string {
  const segs = parseLocationCodeFlat(code);
  return segs ? locationCode(segs) : code;
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
  const router = useRouter();

  const [contents, setContents] = useState<LocationBindContent[]>(initialContents);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phase: Phase = contents.length > 0 ? 'paired' : 'search';

  useEffect(() => {
    setContents(initialContents);
  }, [initialContents, rawCode]);

  // Quick-adjust reconciliation reads the CURRENT rows without re-creating its
  // callbacks on every keystroke — a changing `onCommitted` identity would
  // restart the burst timer inside the commit hook.
  const contentsRef = useRef(contents);

  const publish = useCallback(
    (next: LocationBindContent[]) => {
      contentsRef.current = next;
      setContents(next);
      onChanged({ code, face, contents: next });
    },
    [code, face, onChanged],
  );

  useEffect(() => {
    contentsRef.current = contents;
  }, [contents]);

  /** Apply a signed change to one SKU's committed qty, dropping emptied rows. */
  const applyQty = useCallback(
    (sku: string, resolve: (prev: number) => number) => {
      const next = contentsRef.current
        .map((row) => (row.sku === sku ? { ...row, qty: Math.max(0, resolve(row.qty)) } : row))
        .filter((row) => row.qty > 0);
      publish(next);
    },
    [publish],
  );

  const onCommitStart = useCallback(
    (sku: string, delta: number) => applyQty(sku, (prev) => prev + delta),
    [applyQty],
  );

  const onCommitted = useCallback(
    ({ sku, binQty }: { sku: string; binQty: number | null }) => {
      // `binQty` is the server's answer and outranks our optimistic maths.
      // Offline writes have none — the delta we already folded in stands.
      if (binQty == null) return;
      applyQty(sku, () => binQty);
    },
    [applyQty],
  );

  const onFailed = useCallback(
    ({ sku, delta, message }: { sku: string; delta: number; message: string }) => {
      applyQty(sku, (prev) => prev - delta);
      setError(message);
    },
    [applyQty],
  );

  const invalidateKey = useMemo(() => ['mobile-location-bind', code] as const, [code]);

  const quick = useBinQtyCommit({
    binBarcode: code,
    staffId,
    invalidateKey,
    onCommitStart,
    onCommitted,
    onFailed,
  });

  const bump = useCallback(
    (sku: string, step: number, baseQty: number) => {
      setError(null);
      const accepted = quick.bump(sku, step, baseQty);
      // A refused tap is the floor clamp, not a miss — the reject pattern says
      // "that did nothing" without the operator having to look up.
      vibrateScan(accepted ? 'success' : 'reject');
      return accepted;
    },
    [quick],
  );

  /**
   * The ±1 strip handles the common correction. Anything else — a typed
   * number, a reason code, a direction change — is the qty JOB, and that owns
   * a screen now rather than a fullscreen sheet that covered the tape and the
   * location it was editing.
   *
   * Whatever the thumb already counted is committed first, so the page opens
   * on the real on-hand rather than a number a burst is about to change
   * underneath it.
   */
  const openQtyPage = useCallback(
    (row: LocationBindContent) => {
      void quick.flush();
      router.push(
        `/m/pair/${encodeURIComponent(code)}/${encodeURIComponent(row.sku)}`,
      );
    },
    [code, quick, router],
  );

  const unpair = useCallback(
    async (row: LocationBindContent) => {
      if (busy) return;
      await quick.flush();
      setBusy(true);
      setError(null);
      try {
        if (!segs) throw new Error('Invalid location code');
        await ensureRegistered(code, segs);
        await unpairSku({ code, sku: row.sku, qty: row.qty, staffId });
        publish(contentsRef.current.filter((c) => c.sku !== row.sku));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unpair failed');
      } finally {
        setBusy(false);
      }
    },
    [busy, code, publish, quick, segs, staffId],
  );

  // A location that was never print-registered still needs a row before the
  // qty page can write to it. Registering on MOUNT rather than when a keypad
  // opened means the pair route can assume the location exists.
  useEffect(() => {
    if (!segs) return;
    void ensureRegistered(code, segs).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not register location');
    });
  }, [code, segs]);

  const close = useCallback(() => {
    void quick.flush();
    onClose();
  }, [onClose, quick]);

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
      {/*
        No text field lives in this sheet any more, so the `keyboardHeight`
        lift that used to keep the search results above the OS keyboard is
        gone with it. Nothing here can be typed into.
      */}
      <div className="shrink-0">
        <MobileStationSheet
          label={`Location ${face}`}
          collapsedLabel="Location"
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
          heightClass={
            phase === 'search' ? 'h-auto max-h-[55svh]' : STATION_SHEET_HEIGHT_CLASS
          }
          surfaceClass="bg-surface-card"
          showGrabBar={false}
        >
          <div className="flex h-full min-h-0 flex-col gap-2 px-3 pb-3 pt-2">
            <div className="flex items-center gap-2">
              <IconButton
                type="button"
                size="md"
                radius="flush"
                ariaLabel="Close location"
                icon={<X className="h-4 w-4" />}
                onClick={close}
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

            {phase === 'paired' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                {contents.map((row) => (
                  <LocationQtyStrip
                    key={row.sku}
                    content={row}
                    pendingDelta={quick.pending[row.sku] ?? 0}
                    onBump={(step) => bump(row.sku, step, row.qty)}
                    onCancelPending={() => quick.cancel(row.sku)}
                    onOpenKeypad={() => openQtyPage(row)}
                  />
                ))}
                {/*
                  Unpair takes the ENTIRE quantity, so it only offers itself
                  when there is exactly one thing to take. On a location
                  holding several SKUs a single "Unpair" cannot say which one
                  it means, and guessing the first row is how stock leaves the
                  wrong line. Emptying one row of a shared location is the qty
                  page's take path, which names its SKU.
                */}
                {contents.length === 1 && contents[0] && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    radius="flush"
                    className="self-start"
                    disabled={busy}
                    onClick={() => void unpair(contents[0]!)}
                  >
                    {busy ? 'Unpairing…' : 'Unpair'}
                  </Button>
                )}
              </div>
            ) : (
              /*
                Empty location: the sheet states the fact and hands off. The
                search list that used to live here fought the OS keyboard for
                42svh inside a control strip; pairing is a JOB and now owns a
                screen (`/m/pair/[code]`). Scanning still settles on the
                kernel — only this tap navigates.
              */
              <div className="flex flex-col gap-2 pb-1">
                <p className="text-role-caption text-text-soft">
                  Nothing is paired to this location yet.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  radius="surface"
                  className="w-full"
                  onClick={() => router.push(`/m/pair/${encodeURIComponent(code)}`)}
                >
                  Pair a product
                </Button>
              </div>
            )}
          </div>
        </MobileStationSheet>
      </div>
    </>
  );
}

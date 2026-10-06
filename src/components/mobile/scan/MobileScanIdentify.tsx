'use client';

/** `/m/scan` — identification kernel on the phone. */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useNetworkOnline } from '@/hooks/useConnectionHealth';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { MobileScanHeader, type MobileScanDirection, type MobileScanMode } from '@/components/mobile/scan/MobileScanHeader';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { MobileV2ScanStation } from '@/components/mobile/v2/scan/MobileV2ScanStation';
import {
  pushStationTape,
  stationDedupeId,
  STATION_TAPE_LIMIT,
  type StationItemAction,
  type StationTapeEntry,
} from '@/lib/mobile/station-tape';
import {
  parseArrivalClassifyStep,
  parseArrivalReceivingId,
  parseArrivalTypeHint,
} from '@/lib/receiving/arrival-mobile-flow';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import { locationHubHref, locationHubPath, locationKeypadHref, withLocationScanProof } from '@/lib/mobile/location-hub-href';
import { locationScanLanding, withLocationScanLanding, type LocationScanLanding } from '@/lib/mobile/location-scan-landing';
import { fnskuHubHref } from '@/lib/mobile/fnsku-hub-href';
import { routeScan, unwrapScannedLocation } from '@/lib/barcode-routing';
import {
  LOCATION_TAPE_KEY_PREFIX,
  locationTapeEntry,
  readScanTape,
  recordLocationVisit,
  withStockAdjusts,
  writeScanTape,
} from '@/lib/mobile/scan-tape-session';
import {
  markStockAdjustUndone,
  readStockAdjusts,
  STOCK_ADJUST_EVENT,
  stockAdjustTally,
  undoableStockAdjust,
  type StockAdjustEntry,
} from '@/lib/mobile/stock-adjust-session';
import { locationScanProofExpiresAt } from '@/lib/mobile/location-scan-proof-expiry';
import { fnskuFromTail } from '@/lib/scan-resolver';
import { fetchFnskuRecord } from '@/components/mobile/fnsku/useFnskuRecord';
import { isMobileScanOutCommit } from '@/components/outbound/scan-out/scan-out-commit';
import { postScanOut, undoScanOut } from '@/lib/outbound/scan-out-client';
import { landScanIdentify, viewOnlyIdentityHref } from '@/lib/scan/identify-land';
import { arrivalScanIntent, type ScanInputSource } from '@/lib/scan/mobile-arrival-door';
import { QC_SCAN_SESSION } from '@/lib/scan/dispatch-table';
import { useScanDispatch } from '@/hooks/useScanDispatch';
import { recordMobileSessionEntry } from '@/lib/mobile/mobile-session-feed';
import { MobileArrivalClassifyFlow } from '@/components/mobile/receiving/MobileArrivalClassifyFlow';
import { ARRIVAL_DEDUPE_KIND, arrivalTapeEntry, type SettledArrival } from '@/components/mobile/receiving/arrival-station-tape';
import { useArrivalHistory } from '@/components/mobile/receiving/useArrivalHistory';
import { useArrivalStation } from '@/components/mobile/receiving/useArrivalStation';
import { useArrivalPlacementHandoff } from '@/components/mobile/v2/receiving/useArrivalPlacementHandoff';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { announceStockTransfer, postStockTransfer } from '@/lib/inventory/stock-transfer-client';
import { useQueryClient } from '@tanstack/react-query';
import { locationRecordQueryKey, scanLocation, type ScannedLocation } from '@/components/mobile/scan/location-bind-api';
import {
  resolvePhoneScanIntent,
  withPhoneScanCorrelation,
} from '@/lib/scan/phone-scan-intent';

function withScanMode(href: string, mode: MobileScanMode): string {
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}scanMode=${mode}`;
}

/** Per-device In | Out choice on `/m/scan`. */
const SCAN_DIRECTION_KEY = 'cf.mobile.scan.direction';

function MobileScanIdentifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classifyRid = parseArrivalReceivingId(searchParams.get('rid'));
  const classifyStep = parseArrivalClassifyStep(searchParams.get('step'));
  const classifyTypeHint = parseArrivalTypeHint(searchParams.get('type'));
  const qcArmed = searchParams.get('work') === 'qc';
  const locationOnly = searchParams.get('intent') === 'location';
  const lpnTarget = searchParams.get('lpn')?.trim() || null;
  const operationLocked = locationOnly || qcArmed;
  const [scanMode, setScanMode] = useState<MobileScanMode>(() =>
    operationLocked || searchParams.get('mode') !== 'view' ? 'operate' : 'view',
  );
  // In | Out is per device: a door phone stays In, a shipping-bench phone stays Out.
  const [direction, setDirection] = useState<MobileScanDirection>('in');
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SCAN_DIRECTION_KEY) === 'out') setDirection('out');
    } catch {
      // Storage blocked — stay In.
    }
  }, []);
  const changeDirection = useCallback((next: MobileScanDirection) => {
    setDirection(next);
    try {
      window.localStorage.setItem(SCAN_DIRECTION_KEY, next);
    } catch {
      // Storage blocked — the choice holds for this visit only.
    }
  }, []);
  // View never writes: the direction toggle is hidden there, so a stored Out must not scan anything out.
  const outbound = direction === 'out' && !operationLocked && scanMode === 'operate';

  const [tape, setTape] = useState<StationTapeEntry[]>([]);
  // The loop leaves this page for every location record: the tape comes back
  // from session storage (after mount — the server render has no storage).
  const [tapeRestored, setTapeRestored] = useState(false);
  useEffect(() => {
    setTape(readScanTape());
    setTapeRestored(true);
  }, []);
  useEffect(() => {
    if (tapeRestored) writeScanTape(tape);
  }, [tape, tapeRestored]);
  // What the record pages adjusted this session: the rows' words, Undo and the tally.
  const [adjusts, setAdjusts] = useState<StockAdjustEntry[]>([]);
  useEffect(() => {
    const read = () => setAdjusts(readStockAdjusts());
    read();
    window.addEventListener(STOCK_ADJUST_EVENT, read);
    return () => window.removeEventListener(STOCK_ADJUST_EVENT, read);
  }, []);
  const tally = useMemo(() => stockAdjustTally(adjusts), [adjusts]);
  // Earlier scans cost a server read: none on open, only when the operator asks.
  const [showHistory, setShowHistory] = useState(false);
  const {
    history,
    loading: historyLoading,
    isError: historyFailed,
    retry: retryHistory,
  } = useArrivalHistory({ enabled: showHistory });
  /**
   * This session's rows first — each location says what was adjusted there —
   * then the asked-for history they do not already show.
   */
  const entries = useMemo(() => {
    const own = withStockAdjusts(tape, adjusts);
    if (!showHistory || history.length === 0) return own;
    const live = new Set(own.map((row) => row.dedupeKey).filter(Boolean));
    return [...own, ...history.filter((row) => !row.dedupeKey || !live.has(row.dedupeKey))].slice(0, STATION_TAPE_LIMIT);
  }, [tape, adjusts, history, showHistory]);

  const [cameraOff, setCameraOff] = useState(false);
  const [arrived, setArrived] = useState(0);
  const { playScanFeedback } = useScanFeedback();
  const online = useNetworkOnline();
  const queryClient = useQueryClient();
  // A package at the door → walk the operator to its pairing step (`/m/r/[id]/place`).
  const handOffToPlace = useArrivalPlacementHandoff('/m/scan');

  const onSettled = useCallback(
    (settled: SettledArrival) => {
      // A random id: a restored row from an earlier visit may carry this visit's counter.
      setTape((prev) => pushStationTape(prev, { ...arrivalTapeEntry(settled), id: `arrival-${safeRandomUUID()}` }));
      recordMobileSessionEntry({
        id: `unbox-${safeRandomUUID()}`,
        job: 'unbox',
        title: settled.title,
        identifier: settled.tracking ?? settled.scanned,
        entityId: settled.receivingId == null ? null : String(settled.receivingId),
        state: settled.status === 'arrived' || settled.status === 'known' ? 'done' : settled.status === 'refused' ? 'miss' : 'error',
        href: settled.receivingId == null ? '/m/scan' : `/m/r/${settled.receivingId}`,
        at: new Date().toISOString(),
        dedupeKey: settled.receivingId == null ? null : `unbox:${settled.receivingId}`,
      });
      if (settled.status === 'arrived') setArrived((n) => n + 1);
      playScanFeedback(settled.status === 'arrived' ? 'success' : 'reject');
      handOffToPlace(settled);
    },
    [playScanFeedback, handOffToPlace],
  );

  const { submitRaw, inFlight } = useArrivalStation({ onSettled });
  const { resolve } = useScanDispatch();
  const [dispatching, setDispatching] = useState(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  /** Out: the last confirm's words, and its undoable handle (station rule: live until the next scan). */
  const [outNotice, setOutNotice] = useState<string | null>(null);
  const [outUndo, setOutUndo] = useState<{ entryId: string; shipmentId: number } | null>(null);
  const [outUndoing, setOutUndoing] = useState(false);

  const applyLocationTape = useCallback((entry: StationTapeEntry, href: string) => {
    setTape((prev) => pushStationTape(prev, entry));
    recordLocationVisit(entry, href);
  }, []);

  const onDecode = useCallback(
    (raw: string, source: ScanInputSource) => {
      const value = raw.trim();
      if (!value) return;
      setLocationError(null);
      setOutNotice(null);
      setOutUndo(null);
      setDispatching((n) => n + 1);
      void (async () => {
        try {
          const route = routeScan(value);
          if (locationOnly) {
            if (route?.type !== 'bin' && route?.type !== 'bin-paired-order') {
              setLocationError('That is not a location label');
              playScanFeedback('reject');
              return;
            }
            const code = unwrapScannedLocation(value);
            // One request: registers a new flat location, reads the record, mints the proof.
            let authorized: ScannedLocation;
            try {
              authorized = await scanLocation(code);
            } catch (error) {
              setLocationError(error instanceof Error ? error.message : 'Could not verify location');
              playScanFeedback('reject');
              return;
            }
            const { record, proof } = authorized;
            const returnTo = mobileJobReturn(searchParams.get('returnTo')) ?? '/m/stock';
            const pairSku = searchParams.get('pairSku')?.trim();
            const moveLpn = searchParams.get('moveLpn')?.trim();
            const moveSku = searchParams.get('moveSku')?.trim();
            const moveFrom = searchParams.get('moveFrom')?.trim();
            const moveQty = Number(searchParams.get('moveQty'));
            if (moveLpn) {
              const commandId = safeRandomUUID();
              const response = await fetch(`/api/handling-units/${encodeURIComponent(moveLpn)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
                body: JSON.stringify({
                  action: 'move',
                  locationCode: code,
                  locationVerificationToken: proof,
                  clientEventId: commandId,
                }),
              });
              const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
              if (!response.ok || !body?.success) {
                setLocationError(body?.error || 'Could not move the LPN');
                playScanFeedback('reject');
                return;
              }
              playScanFeedback('success');
              router.replace(returnTo);
              return;
            }
            if (moveSku && moveFrom && Number.isSafeInteger(moveQty) && moveQty > 0) {
              let receipt;
              try {
                receipt = await postStockTransfer({ fromBarcode: moveFrom, toBarcode: code, sku: moveSku, qty: moveQty });
              } catch (error) {
                setLocationError(error instanceof Error ? error.message : 'Could not move the stock');
                playScanFeedback('reject');
                return;
              }
              playScanFeedback('success');
              announceStockTransfer(receipt, {
                onSettled: () => queryClient.invalidateQueries({ queryKey: ['mobile-location-bind'] }),
              });
              router.replace(returnTo);
              return;
            }
            let href: string;
            let landingKind: LocationScanLanding['kind'] = 'record';
            if (pairSku) {
              href = locationKeypadHref(code, pairSku, { returnTo, verificationToken: proof });
            } else {
              // The hub paints from this read; no second GET for the same record.
              queryClient.setQueryData(locationRecordQueryKey(code), record);
              // A re-scan for an expired proof goes back to the SKU it was adjusting.
              const resumeSku = searchParams.get('resumeSku')?.trim();
              const landing: LocationScanLanding = resumeSku && record.contents.some((row) => row.sku === resumeSku)
                ? { kind: 'adjust', sku: resumeSku }
                : locationScanLanding(record);
              landingKind = landing.kind;
              href = withLocationScanProof(withLocationScanLanding(withJobReturn(locationHubPath(code), returnTo), landing), proof);
            }
            applyLocationTape(locationTapeEntry(code), href);
            // Eyes-free: the chirp means "±1 is ready"; the double note means "look first".
            playScanFeedback(pairSku || landingKind === 'adjust' ? 'success' : 'warn');
            router.push(href);
            return;
          }
          const correlation = await resolvePhoneScanIntent(value, safeRandomUUID());
          const dispatch = await resolve(value, qcArmed ? QC_SCAN_SESSION : null);
          const returnTo = searchParams.get('returnTo');
          if (returnTo === '/m/orders') {
            // Allocate opens scan as a find action, not a route away from the
            // queue. The queue runs the scanned value through its existing
            // backend search contract and spotlights the matching work.
            router.push(withPhoneScanCorrelation(`/m/orders?scan=${encodeURIComponent(value)}`, correlation));
            return;
          }
          if (returnTo === '/m/orders/new') {
            // The shared dispatch path has already classified this scan. Return
            // the raw value to the mobile intake surface so it can decide whether
            // it is an order number, SKU, or item number without a second parser.
            router.push(withPhoneScanCorrelation(`/m/orders/new?scan=${encodeURIComponent(value)}`, correlation));
            return;
          }
          if (outbound && isMobileScanOutCommit(value, route?.type)) {
            // Out: the real dock scan-out — the same POST the desk scan-out station sends.
            const result = await postScanOut(value).catch(() => null);
            if (!result) {
              setLocationError('Scan-out failed — try again');
              playScanFeedback('reject');
              return;
            }
            if (!result.matched) {
              setLocationError('Not a package we shipped · switch to Inbound to receive it');
              playScanFeedback('reject');
              return;
            }
            if (result.blocked) {
              setLocationError(result.message || 'Do not ship');
              playScanFeedback('reject');
              return;
            }
            const name = result.orderId || result.tracking || value;
            const entryId = `scan-out-${safeRandomUUID()}`;
            setTape((prev) =>
              pushStationTape(prev, {
                id: entryId,
                tone: result.duplicate ? 'warn' : 'ok',
                verb: result.duplicate ? 'Already scanned out' : 'Scanned out',
                title: result.productTitle ?? null,
                identifier: result.tracking || value,
                recordId: result.orderId ?? null,
                conditionGrade: result.condition ?? null,
                imageUrl: result.imageUrl ?? null,
                actor: null,
                actorId: null,
                message: null,
                at: new Date().toISOString(),
                dedupeKey: result.shipmentId ? `scan-out:${result.shipmentId}` : null,
                live: true,
              }),
            );
            // Undo matches the station: only a fresh confirm, only until the next scan.
            if (!result.duplicate && result.shipmentId) setOutUndo({ entryId, shipmentId: result.shipmentId });
            setOutNotice(`${result.duplicate ? 'Already scanned out' : 'Scanned out'} · ${name}`);
            playScanFeedback(result.duplicate ? 'warn' : 'success');
            return;
          }
          if (!dispatch) {
            if (scanMode === 'view' || outbound) {
              setLocationError(outbound ? 'Nothing to scan out · switch to Inbound to receive' : 'No saved record found · switch to Operate to intake');
              playScanFeedback('reject');
              return;
            }
            submitRaw(value, source, correlation);
            return;
          }
          if (qcArmed && lpnTarget) {
            if (route?.type !== 'serial-unit') {
              setLocationError('Scan a unit label to add it to this LPN');
              playScanFeedback('reject');
              return;
            }
            const commandId = safeRandomUUID();
            const response = await fetch(`/api/handling-units/${encodeURIComponent(lpnTarget)}/assign`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
              body: JSON.stringify({ units: [value], idempotencyKey: commandId }),
            });
            const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string; unresolved?: string[] } | null;
            if (!response.ok || !body?.success) {
              setLocationError(body?.unresolved?.length ? `Unit not found: ${body.unresolved.join(', ')}` : body?.error || 'Could not add the unit to this LPN');
              playScanFeedback('reject');
              return;
            }
          }
          // A bare 7-character guess may be an FNSKU tail; the catalog decides.
          const tail = route?.redirect ? null : fnskuFromTail(value);
          if (tail && (await fetchFnskuRecord(tail).catch(() => null))) {
            router.push(withPhoneScanCorrelation(fnskuHubHref(tail), correlation));
            return;
          }
          // View means identity, never the object's next operational job. A
          // carton with open QC may dispatch to its QC card in Operate mode;
          // support staff scanning the same printed R-label must see the carton
          // record, its ticket and its contents instead.
          if (scanMode === 'view' && !qcArmed && route?.type === 'receiving') {
            const identityHref = viewOnlyIdentityHref(route);
            if (identityHref) {
              const href = withJobReturn(withScanMode(identityHref, 'view'), '/m/scan');
              router.push(withPhoneScanCorrelation(href, correlation));
              return;
            }
          }
          // Inbound: whatever the door would treat as a tracking is the door
          // loop — the station previews it, settles it `known` or opens the
          // arrival. The door rule, not the route type, decides — and a typed
          // last 8 is a tracking even though its bytes route as a product.
          const inboundDoor = !outbound && !qcArmed && scanMode === 'operate';
          if (inboundDoor && arrivalScanIntent(value, source).kind === 'tracking') {
            submitRaw(value, source, correlation);
            return;
          }
          const land = landScanIdentify(dispatch, route);
          if (land.kind === 'identify') {
            const receivingRecord = !qcArmed && route?.type === 'receiving' && land.href.startsWith('/m/r/');
            const href = lpnTarget
              ? withJobReturn(land.href, `/m/qc/lpn/${encodeURIComponent(lpnTarget)}`)
              : receivingRecord
                ? withJobReturn(withScanMode(land.href, scanMode), '/m/scan')
                : land.href;
            router.push(withPhoneScanCorrelation(href, correlation));
            return;
          }
          if (land.kind === 'intake') {
            if (scanMode === 'view' || outbound) {
              setLocationError(outbound ? 'Nothing to scan out · switch to Inbound to receive' : 'No saved record found · switch to Operate to intake');
              playScanFeedback('reject');
              return;
            }
            submitRaw(value, source, correlation);
            return;
          }
          if (route?.type !== 'bin' && route?.type !== 'bin-paired-order') {
            // No Inbound scan is silent: a label with nowhere to go settles a
            // tape row ("Not an arrival") through the door's own refusal.
            if (inboundDoor) submitRaw(value, source, correlation);
            return;
          }
          // A location is a full-screen record with an X back here, never
          // a sheet over the camera (operator 2026-09-25).
          const code = unwrapScannedLocation(value);
          let authorized: ScannedLocation;
          try {
            authorized = await scanLocation(code);
          } catch (error) {
            setLocationError(error instanceof Error ? error.message : 'Could not verify location');
            playScanFeedback('reject');
            return;
          }
          // One loose item opens straight on its ±1 adjust; several ask which first.
          queryClient.setQueryData(locationRecordQueryKey(code), authorized.record);
          const landing = locationScanLanding(authorized.record);
          const href = withLocationScanProof(withLocationScanLanding(locationHubHref(code), landing), authorized.proof);
          applyLocationTape(locationTapeEntry(code), href);
          playScanFeedback(landing.kind === 'adjust' ? 'success' : 'warn');
          router.push(withPhoneScanCorrelation(href, correlation));
        } finally {
          setDispatching((n) => Math.max(0, n - 1));
        }
      })();
    },
    [resolve, qcArmed, locationOnly, router, searchParams, submitRaw, playScanFeedback, applyLocationTape, scanMode, lpnTarget, queryClient, outbound],
  );

  // The kernel owns hardware scans on this screen.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const raw = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (!raw?.trim()) return;
      event.preventDefault();
      onDecode(raw, 'scanned');
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [onDecode]);

  /**
   * A carton row opens the carton itself (operator 2026-09-24:
   * A carton row opens the carton itself (operator 2026-09-24: the primary
   */
  const opens = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const entry of entries) {
      if (!entry.dedupeKey) continue;
      if (entry.dedupeKey.startsWith(LOCATION_TAPE_KEY_PREFIX)) {
        const href = locationHubHref(entry.dedupeKey.slice(LOCATION_TAPE_KEY_PREFIX.length));
        map.set(entry.dedupeKey, () => router.push(href));
        continue;
      }
      const receivingId = stationDedupeId(ARRIVAL_DEDUPE_KIND, entry.dedupeKey);
      if (receivingId == null) continue;
      const href = withJobReturn(`/m/r/${receivingId}`, '/m/scan');
      map.set(entry.dedupeKey, () => router.push(href));
    }
    return map;
  }, [entries, router]);

  const itemOpen = useCallback(
    (entry: StationTapeEntry): (() => void) | null => (entry.dedupeKey && opens.get(entry.dedupeKey)) || null,
    [opens],
  );

  const undoOut = useCallback(() => {
    if (!outUndo || outUndoing) return;
    const { entryId, shipmentId } = outUndo;
    setOutUndoing(true);
    void undoScanOut(shipmentId)
      .then(() => {
        setOutUndo(null);
        setOutNotice('Scan-out undone');
        setTape((prev) => prev.filter((row) => row.id !== entryId));
        playScanFeedback('success');
      })
      .catch(() => {
        setLocationError('Undo failed — try again');
        playScanFeedback('reject');
      })
      .finally(() => setOutUndoing(false));
  }, [outUndo, outUndoing, playScanFeedback]);

  /** A session adjust is undone with the same scan proof, as the inverse write. */
  const { user } = useAuth();
  const [undoingAdjust, setUndoingAdjust] = useState<string | null>(null);
  const undoAdjust = useCallback((adjust: StockAdjustEntry) => {
    if (!adjust.proof || undoingAdjust) return;
    const commandId = safeRandomUUID();
    setUndoingAdjust(adjust.id);
    void fetch(`/api/locations/${encodeURIComponent(adjust.code)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
      body: JSON.stringify({
        action: adjust.delta > 0 ? 'take' : 'put',
        sku: adjust.sku,
        qty: Math.abs(adjust.delta),
        staffId: user?.staffId ?? 0,
        reason: 'UNDO',
        notes: `Undo of ${adjust.delta > 0 ? '+' : '−'}${Math.abs(adjust.delta)} at ${adjust.face}`,
        clientEventId: commandId,
        locationVerificationToken: adjust.proof,
      }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!response.ok || body?.success === false) throw new Error(body?.error || 'Undo failed — try again');
        markStockAdjustUndone(adjust.id);
        void queryClient.invalidateQueries({ queryKey: locationRecordQueryKey(adjust.code) });
        playScanFeedback('success');
      })
      .catch((error: unknown) => {
        setLocationError(error instanceof Error ? error.message : 'Undo failed — try again');
        playScanFeedback('reject');
      })
      .finally(() => setUndoingAdjust(null));
  }, [playScanFeedback, queryClient, undoingAdjust, user?.staffId]);

  const itemActions = useCallback(
    (entry: StationTapeEntry): readonly StationItemAction[] | null => {
      if (outUndo && entry.id === outUndo.entryId) {
        return [{ label: 'Undo scan-out', pendingLabel: 'Undoing…', run: undoOut, pending: outUndoing }];
      }
      if (!entry.dedupeKey?.startsWith(LOCATION_TAPE_KEY_PREFIX)) return null;
      const adjust = undoableStockAdjust(adjusts, entry.dedupeKey.slice(LOCATION_TAPE_KEY_PREFIX.length));
      // Only while its scan proof still authorizes a write at that location.
      const expiresAt = locationScanProofExpiresAt(adjust?.proof ?? null);
      if (!adjust || expiresAt == null || expiresAt <= Date.now()) return null;
      return [{
        label: `Undo ${adjust.sku} ${adjust.delta > 0 ? '+' : '−'}${Math.abs(adjust.delta)}`,
        pendingLabel: 'Undoing…',
        run: () => undoAdjust(adjust),
        pending: undoingAdjust === adjust.id,
      }];
    },
    [adjusts, outUndo, outUndoing, undoAdjust, undoOut, undoingAdjust],
  );

  /**
   * Unsettled commits — the lip lane's input, and the only thing on the panel
   * that animates. Zero means the server has answered everything.
   */
  const pending = inFlight + dispatching;

  /** The middle slot, as a COUNT. */
  const status = useMemo(() => {
    if (!online) return 'Offline';
    // The latest scan's words outrank a standing camera fault — a typed label still scans.
    if (locationError) return locationError;
    if (outbound && outNotice && pending === 0) return outNotice;
    if (cameraOff) return 'Camera off';
    // This session's stock work: distinct locations touched and units moved.
    const stock = tally.locations > 0
      ? `${tally.locations} location${tally.locations === 1 ? '' : 's'} · ${tally.units} unit${tally.units === 1 ? '' : 's'}`
      : null;
    if (locationOnly) return pending > 0 ? 'Checking location…' : stock ?? 'Location scan';
    if (pending > 0) return `${pending} pending · ${arrived} in`;
    if (scanMode === 'view') return 'View only';
    if (outbound) return 'Out';
    return stock && arrived === 0 ? stock : stock ? `${arrived} in · ${stock}` : `${arrived} in`;
  }, [online, cameraOff, locationError, locationOnly, pending, arrived, scanMode, outbound, outNotice, tally]);

  if (classifyRid != null) {
    return (
      <MobileArrivalClassifyFlow receivingId={classifyRid} step={classifyStep} typeHint={classifyTypeHint} />
    );
  }

  const exitHref = locationOnly
    ? mobileJobReturn(searchParams.get('returnTo'))
    : lpnTarget
      ? `/m/qc/lpn/${encodeURIComponent(lpnTarget)}`
      : mobileJobReturn(searchParams.get('returnTo'));
  const scanTitle = locationOnly ? 'Scan location' : qcArmed ? 'Quality control' : 'Scan';

  // Package history is a server read: only on the operator's tap, from the
  // empty screen or under this session's rows. Locations have no package history.
  const historyControl = locationOnly ? null : historyFailed ? (
    <div className="flex flex-col items-center gap-2">
      <p className="text-role-eyebrow text-text-danger">Could not load earlier packages</p>
      <Button variant="secondary" size="lg" radius="mode" className="min-h-mode-hit" onClick={() => void retryHistory()}>
        Try again
      </Button>
    </div>
  ) : showHistory && !historyLoading ? (
    history.length === 0 ? <p className="text-role-eyebrow text-text-soft">No recent scans</p> : null
  ) : (
    <Button
      variant="ghost"
      size="lg"
      radius="mode"
      className="min-h-mode-hit"
      loading={historyLoading}
      onClick={() => setShowHistory(true)}
      data-testid="scan-recent-history"
    >
      Recent scans
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      <MobileScanHeader
        title={scanTitle}
        mode={operationLocked ? 'operate' : scanMode}
        onModeChange={setScanMode}
        direction={operationLocked || scanMode === 'view' ? undefined : direction}
        onDirectionChange={changeDirection}
        operationLocked={operationLocked}
        exitHref={exitHref}
      />
      <div className="min-h-0 flex-1">
        <MobileV2ScanStation
          entries={entries}
          untitledLabel="Package"
          itemActions={itemActions}
          empty={
            <div className="flex flex-col items-center gap-3 px-8 pb-6 text-center">
              <p className="text-role-eyebrow text-text-soft">
                {locationOnly
                  ? 'Scan a shelf or bin location'
                  : qcArmed
                    ? 'Quality control — scan an LPN, carton, line or unit'
                    : scanMode === 'view'
                      ? 'View records without changing them'
                      : outbound
                        ? 'Scan a shipping label to scan it out'
                        : 'Scan a tracking number or location code'}
              </p>
              {historyControl}
            </div>
          }
          more={historyControl}
          itemOpen={itemOpen}
          captureWindow={
            <MobileCaptureWindow
              label="Scan camera"
              collapsedLabel={
                locationOnly ? 'Scan a location' : qcArmed ? 'Scan QC label' : 'Scan a label'
              }
              status={status}
              statusAlert={cameraOff || !online || Boolean(locationError)}
              pending={pending}
              onDecode={onDecode}
              onErrorChange={setCameraOff}
              // The Inbound door takes a tracking number's last 8 when the
              // carrier label will not scan (operator 2026-10-04).
              manualLabel={!locationOnly && !outbound && !qcArmed && scanMode === 'operate' ? 'Tracking or last 8 digits' : undefined}
            />
          }
        />
      </div>
    </div>
  );
}

export default function MobileScanIdentify() {
  return (
    <Suspense fallback={<div className="h-full bg-surface-canvas" />}>
      <MobileScanIdentifyInner />
    </Suspense>
  );
}

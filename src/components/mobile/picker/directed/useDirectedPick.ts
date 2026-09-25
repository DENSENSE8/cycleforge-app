'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';
import type { ShortPickResult } from '@/components/mobile/picker/ShortPickSheet';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import {
  directedPickInstruction,
  directedPickStep,
  locationFace,
  matchItemScan,
  matchesLocationScan,
  type DirectedPickLine,
  type DirectedPickLocation,
  type DirectedPickNext,
  type DirectedPickOrder,
  type DirectedPickStep,
} from '@/lib/picking/directed-pick';
import { toteRefFromScan } from '@/lib/picking/tote-ref';
import { playScanTone, vibrateScan, type ScanFeedbackKind } from '@/lib/scan-feedback/play';

/** Survives a reload so the run's progress bar does not restart at zero. */
const RUN_KEY = 'cf.pick.directed.runStartedAt';
/** A finished line stays on screen this long so the success reads before the next bin replaces it. */
const ADVANCE_DELAY_MS = 450;

export type DirectedPickMessage = { tone: 'error' | 'success' | 'info'; text: string };

/** What the directed screen renders from, and every verb it can call. */
export interface DirectedPickController {
  isLoaded: boolean;
  signedIn: boolean;
  loading: boolean;
  loadError: string | null;
  retry: () => Promise<void>;
  data: DirectedPickNext | null;
  order: DirectedPickOrder | null;
  line: DirectedPickLine | null;
  /** The tote armed for the current order, or null until one is scanned. */
  tote: string | null;
  step: DirectedPickStep;
  instruction: string;
  pickedCount: number;
  busy: boolean;
  message: DirectedPickMessage | null;
  dismissMessage: () => void;
  /** Run clock, `m:ss` (or `h:mm:ss`). */
  elapsed: string;
  cameraOpen: boolean;
  setCameraOpen: (open: boolean) => void;
  shortOpen: boolean;
  setShortOpen: (open: boolean) => void;
  notesOpen: boolean;
  setNotesOpen: (open: boolean) => void;
  handleScan: (raw: string) => void;
  handleShort: (result: ShortPickResult) => Promise<void>;
  saveNote: (text: string) => Promise<boolean>;
  /**
   * Pairing the line's SKU to a bin: the next scan names the location the
   * line's units now live in (NOT the tote — that is the order's carrier).
   */
  pairing: boolean;
  startPairing: () => void;
  cancelPairing: () => void;
  /** Forget the run start so the next visit begins a fresh progress count. */
  endRun: () => void;
}

function readRunStart(): string {
  try {
    const kept = window.sessionStorage.getItem(RUN_KEY);
    if (kept && !Number.isNaN(Date.parse(kept))) return kept;
    const fresh = new Date().toISOString();
    window.sessionStorage.setItem(RUN_KEY, fresh);
    return fresh;
  } catch {
    return new Date().toISOString();
  }
}

/** Every accepted or refused scan is heard and felt — the worker rarely looks down. */
function feedback(kind: ScanFeedbackKind): void {
  playScanTone(kind);
  vibrateScan(kind);
}

/**
 * The directed picker's session: asks `POST /api/picking/next` for one line,
 * walks it tote → location → item × N on scans (camera or wedge), confirms
 * each unit through the WMS execution socket (`pick.confirm`, idempotent per
 * allocation), and asks for the next line the moment the last unit lands.
 */
export function useDirectedPick(scanPaused = false): DirectedPickController {
  const { user, isLoaded } = useAuth();
  const { execute } = useWmsRealtime();

  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [data, setData] = useState<DirectedPickNext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toteByOrder, setToteByOrder] = useState<Record<number, string>>({});
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<DirectedPickMessage | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [pairing, setPairing] = useState(false);
  /** The bin this line was just paired to — it replaces the feed's location until the next line. */
  const [pairedLocation, setPairedLocation] = useState<DirectedPickLocation | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const advanceTimer = useRef<number | null>(null);

  useEffect(() => {
    setRunStartedAt(readRunStart());
  }, []);

  // The elapsed clock on the order card.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current);
    },
    [],
  );

  const fedLine = data?.line ?? null;
  const line = useMemo<DirectedPickLine | null>(
    () => (fedLine && pairedLocation ? { ...fedLine, location: pairedLocation } : fedLine),
    [fedLine, pairedLocation],
  );
  const order = data?.order ?? null;
  const tote = order ? (toteByOrder[order.orderId] ?? order.toteCode ?? null) : null;
  const step = directedPickStep({ line, toteArmed: Boolean(tote), locationConfirmed, pickedCount: picked.size });

  const fetchNext = useCallback(async () => {
    if (!runStartedAt) return;
    setLoading(true);
    try {
      const res = await fetch('/api/picking/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_started_at: runStartedAt }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || `Could not load the next pick (${res.status})`);
      const next = body as DirectedPickNext;
      setData(next);
      setLoadError(null);
      setLocationConfirmed(false);
      setPicked(new Set());
      setPairing(false);
      setPairedLocation(null);
      if (next.stagedTotes.length > 0) {
        setMessage({ tone: 'success', text: `Tote ${next.stagedTotes.join(', ')} staged for pack` });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the next pick');
    } finally {
      setLoading(false);
    }
  }, [runStartedAt]);

  useEffect(() => {
    if (isLoaded && user && runStartedAt) void fetchNext();
  }, [isLoaded, user, runStartedAt, fetchNext]);

  const advanceSoon = useCallback(() => {
    setCameraOpen(false);
    if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      void fetchNext();
    }, ADVANCE_DELAY_MS);
  }, [fetchNext]);

  const confirmUnit = useCallback(
    async (allocationId: number) => {
      if (!line || !order || !user || data?.sessionId == null || !tote) return;
      setBusy(true);
      try {
        await execute({
          v: 1,
          commandId: `pick:${data.sessionId}:${allocationId}`,
          organizationId: user.organizationId,
          staffId: user.staffId,
          issuedAt: new Date().toISOString(),
          name: 'pick.confirm',
          input: { sessionId: data.sessionId, allocationId, toteScan: tote, completeSession: false },
        });
        feedback('success');
        const nextPicked = new Set(picked);
        nextPicked.add(allocationId);
        setPicked(nextPicked);
        if (nextPicked.size >= line.units.length) {
          setMessage({ tone: 'success', text: `Picked ${line.units.length} × ${line.sku}` });
          advanceSoon();
        } else {
          setMessage(null);
        }
      } catch (err) {
        feedback('reject');
        const text = err instanceof Error ? err.message : 'Pick failed — scan again';
        // A refused tote (another order's, or not a tote) must be re-armed.
        if (/tote/i.test(text)) {
          setToteByOrder((prev) => {
            const copy = { ...prev };
            delete copy[order.orderId];
            return copy;
          });
        }
        setMessage({ tone: 'error', text });
      } finally {
        setBusy(false);
      }
    },
    [line, order, user, data?.sessionId, tote, execute, picked, advanceSoon],
  );

  /**
   * Pair the line's open units to the scanned location — the same write the
   * unit hub's "Move to bin" makes (`POST /api/serial-units/:id/move`: the
   * unit's `current_location` + a MOVED event). The worker is standing at
   * that bin, so it counts as the confirmed location for this line.
   */
  const pairBin = useCallback(
    async (raw: string) => {
      if (!line) return;
      const bin = unwrapScannedLocation(raw);
      if (!bin) return;
      const open = line.units.filter((u) => !picked.has(u.allocationId));
      if (open.length === 0) return;
      setBusy(true);
      try {
        let paired: DirectedPickLocation | null = null;
        for (const unit of open) {
          const res = await fetch(`/api/serial-units/${unit.serialUnitId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bin_barcode: bin,
              bin_name: bin,
              notes: `Paired while picking${data?.sessionId != null ? ` (session ${data.sessionId})` : ''}`,
              client_event_id: `pick-pair:${data?.sessionId ?? 'none'}:${unit.serialUnitId}:${bin}`,
            }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok || !body?.success) {
            throw new Error(
              res.status === 404 ? `"${bin}" is not a location — scan a bin label` : body?.error || `Pairing failed (${res.status})`,
            );
          }
          paired = { name: body.location?.name ?? bin, barcode: body.location?.barcode ?? null, room: null };
        }
        const home = await fetch('/api/update-sku-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: line.sku, location: paired?.barcode ?? bin }),
        });
        const homeBody = await home.json().catch(() => null);
        if (!home.ok || !homeBody?.success) {
          throw new Error(homeBody?.error || `Units moved, but item location was not updated (${home.status}). Scan the bin again.`);
        }
        feedback('success');
        setPairedLocation(paired);
        setLocationConfirmed(true);
        setPairing(false);
        setMessage({
          tone: 'success',
          text: `${line.sku} paired to ${locationFace(paired)}${open.length > 1 ? ` · ${open.length} units` : ''}`,
        });
      } catch (err) {
        feedback('reject');
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Pairing failed — scan the bin again' });
      } finally {
        setBusy(false);
      }
    },
    [line, picked, data?.sessionId],
  );
  const armTote = useCallback(async (ref: string) => {
    if (!order || data?.sessionId == null) return;
    setBusy(true);
    try {
      const response = await fetch('/api/picking/tote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: data.sessionId, orderId: order.orderId, toteScan: ref }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Could not pair tote');
      feedback('success');
      setToteByOrder((prev) => ({ ...prev, [order.orderId]: body.toteCode }));
      setMessage({ tone: 'success', text: `Tote ${body.toteCode} paired to ${order.orderLabel}` });
    } catch (error) {
      feedback('reject');
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not pair tote' });
    } finally {
      setBusy(false);
    }
  }, [order, data?.sessionId]);


  const handleScan = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value || busy || scanPaused || shortOpen || notesOpen || !line || !order) return;
      if (pairing) {
        void pairBin(value);
        return;
      }
      if (step === 'tote') {
        const ref = toteRefFromScan(value);
        if (!ref) {
          feedback('reject');
          setMessage({ tone: 'error', text: `"${value}" is not a tote — scan an H-… plate` });
          return;
        }
        void armTote(ref);
        return;
      }
      if (step === 'location') {
        if (matchesLocationScan(value, line.location)) {
          feedback('success');
          setLocationConfirmed(true);
          setMessage(null);
          return;
        }
        feedback('reject');
        setMessage({ tone: 'error', text: `Scanned "${value}" — go to ${locationFace(line.location)}` });
        return;
      }
      if (step === 'item') {
        const allocationId = matchItemScan(value, line, picked);
        if (allocationId == null) {
          feedback('reject');
          setMessage({ tone: 'error', text: `Scanned "${value}" — not ${line.sku}` });
          return;
        }
        void confirmUnit(allocationId);
      }
    },
    [busy, scanPaused, shortOpen, notesOpen, line, order, step, picked, confirmUnit, pairing, pairBin, armTote],
  );

  // Hardware scanner: claim every wedge read on this screen so a bin label
  // is a pick step here, never a navigation to the bin's page.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: string }>).detail;
      if (!detail?.value) return;
      event.preventDefault();
      handleScan(detail.value);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [handleScan]);

  const handleShort = useCallback(
    async (result: ShortPickResult) => {
      if (!line || !user || data?.sessionId == null) return;
      const open = line.units.filter((u) => !picked.has(u.allocationId));
      setBusy(true);
      try {
        for (const unit of open) {
          await execute({
            v: 1,
            commandId: `short:${data.sessionId}:${unit.allocationId}`,
            organizationId: user.organizationId,
            staffId: user.staffId,
            issuedAt: new Date().toISOString(),
            name: 'pick.short',
            input: {
              sessionId: data.sessionId,
              allocationId: unit.allocationId,
              pickedQty: result.pickedQty,
              plannedQty: result.plannedQty,
              reason: result.reason,
              note: result.note,
            },
          });
        }
        feedback('success');
        setMessage({ tone: 'info', text: `${open.length} short at ${locationFace(line.location)} — released to stock` });
        advanceSoon();
      } catch (err) {
        feedback('reject');
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Short pick failed — try again' });
      } finally {
        setBusy(false);
      }
    },
    [line, user, data?.sessionId, picked, execute, advanceSoon],
  );

  const saveNote = useCallback(
    async (text: string): Promise<boolean> => {
      if (!line || data?.sessionId == null) return false;
      const res = await fetch(`/api/picking/session/${data.sessionId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocation_ids: line.units.map((u) => u.allocationId), text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setMessage({ tone: 'error', text: body?.error || 'Note not saved' });
        return false;
      }
      setMessage({ tone: 'info', text: 'Note saved on this line' });
      return true;
    },
    [line, data?.sessionId],
  );

  const elapsed = useMemo(() => {
    if (!runStartedAt) return '0:00';
    const secs = Math.max(0, Math.floor((now - Date.parse(runStartedAt)) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = String(secs % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }, [now, runStartedAt]);

  const endRun = useCallback(() => {
    try {
      window.sessionStorage.removeItem(RUN_KEY);
    } catch {
      /* private mode — nothing kept */
    }
  }, []);

  return {
    isLoaded,
    signedIn: Boolean(user),
    loading,
    loadError,
    retry: fetchNext,
    data,
    order,
    line,
    tote,
    step,
    instruction: pairing && line ? `Scan the bin to pair ${line.sku}` : directedPickInstruction(step, line, picked.size),
    pickedCount: picked.size,
    busy,
    message,
    dismissMessage: () => setMessage(null),
    elapsed,
    cameraOpen,
    setCameraOpen,
    shortOpen,
    setShortOpen,
    notesOpen,
    setNotesOpen,
    handleScan,
    handleShort,
    saveNote,
    pairing,
    startPairing: () => {
      setPairing(true);
      setMessage(null);
      setCameraOpen(true);
    },
    cancelPairing: () => setPairing(false),
    endRun,
  };
}

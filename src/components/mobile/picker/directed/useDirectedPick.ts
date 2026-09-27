'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';
import type { ShortPickResult } from '@/components/mobile/picker/ShortPickSheet';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import {
  directedPickScanLabel,
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
import { v1Request } from '@/lib/api/v1-client';
import {
  directedPickNextSchema,
  pickNoteSchema,
  pickReleaseSchema,
  pickToteSchema,
} from '@/lib/picking/picking-v1-contract';
import { playScanTone, vibrateScan, type ScanFeedbackKind } from '@/lib/scan-feedback/play';

/** Survives a reload so the run's progress bar does not restart at zero. */
const RUN_KEY = 'cf.pick.directed.runStartedAt';
/** Orders the picker skipped this run — the feed does not offer them again until the run ends. */
const SKIP_KEY = 'cf.pick.directed.skippedOrderIds';
/** A finished line stays on screen this long so the success reads before the next bin replaces it. */
const ADVANCE_DELAY_MS = 450;

export type DirectedPickMessage = { tone: 'error' | 'success' | 'info'; text: string };

/** What the directed screen renders from, and every verb it can call. */
interface DirectedPickController {
  isLoaded: boolean;
  signedIn: boolean;
  loading: boolean;
  /** The signed-in picker — the order card says whether a pick is theirs. */
  viewerStaffId: number | null;
  loadError: string | null;
  retry: () => Promise<void>;
  data: DirectedPickNext | null;
  order: DirectedPickOrder | null;
  line: DirectedPickLine | null;
  /** The tote armed for the current order, or null until one is scanned. */
  tote: string | null;
  step: DirectedPickStep;
  /** The scan bar's verb — the step's next action, `Saving…` while a scan is in flight. */
  scanLabel: string;
  pickedCount: number;
  busy: boolean;
  message: DirectedPickMessage | null;
  dismissMessage: () => void;
  /** Run clock, `m:ss` (or `h:mm:ss`). */
  elapsed: string;
  /**
   * Re-arm requests for the bottom capture window (a counter — each increment
   * lifts it once). Reset to 0 per line, so a fresh line's window mounts collapsed.
   */
  cameraArmRequest: number;
  shortOpen: boolean;
  setShortOpen: (open: boolean) => void;
  notesOpen: boolean;
  setNotesOpen: (open: boolean) => void;
  passOpen: boolean;
  setPassOpen: (open: boolean) => void;
  handleScan: (raw: string) => void;
  handleShort: (result: ShortPickResult) => Promise<void>;
  saveNote: (text: string) => Promise<boolean>;
  /** Put this order back (unheld, unassigned from me) and never offer it again this run. */
  skip: () => Promise<void>;
  /** Assign this order to another picker and let go of it. */
  passTo: (staff: { id: number; name: string }) => Promise<void>;
  /**
   * Pairing the line's SKU to a bin: the next scan names the location the
   * line's units now live in (NOT the tote — that is the order's carrier).
   */
  pairing: boolean;
  startPairing: () => void;
  cancelPairing: () => void;
  /** Forget the run start and its skips so the next visit begins a fresh run. */
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

function readSkipped(): number[] {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(SKIP_KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

function writeSkipped(ids: readonly number[]): void {
  try {
    window.sessionStorage.setItem(SKIP_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — the skip lasts this page only */
  }
}

/** End the caller's open session(s) on an order so it is not held by this picker. */
async function releaseOrder(orderId: number): Promise<void> {
  await v1Request('/api/v1/picking/release', pickReleaseSchema, {
    method: 'POST',
    body: { orderId },
    fallbackMessage: 'Could not release the order',
  });
}

/** Every accepted or refused scan is heard and felt — the worker rarely looks down. */
function feedback(kind: ScanFeedbackKind): void {
  playScanTone(kind);
  vibrateScan(kind);
}

/** The directed picker's session: */
export function useDirectedPick(scanPaused = false): DirectedPickController {
  const { user, isLoaded } = useAuth();
  const { execute } = useWmsRealtime();
  const { mutateAsync: assignOrder } = useOrderAssignment();

  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [data, setData] = useState<DirectedPickNext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toteByOrder, setToteByOrder] = useState<Record<number, string>>({});
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<DirectedPickMessage | null>(null);
  const [cameraArmRequest, setCameraArmRequest] = useState(0);
  const [shortOpen, setShortOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [pairing, setPairing] = useState(false);
  /** The bin this line was just paired to — it replaces the feed's location until the next line. */
  const [pairedLocation, setPairedLocation] = useState<DirectedPickLocation | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const advanceTimer = useRef<number | null>(null);
  /** This run's skipped orders — a ref so skipping does not re-key `fetchNext` (and re-fire the load). */
  const skipped = useRef<number[]>([]);

  useEffect(() => {
    skipped.current = readSkipped();
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
      const next = await v1Request('/api/v1/picking/next', directedPickNextSchema, {
        method: 'POST',
        body: { runStartedAt, skipOrderIds: skipped.current },
        fallbackMessage: 'Could not load the next pick',
      });
      setData(next);
      setLoadError(null);
      setLocationConfirmed(false);
      setPicked(new Set());
      setPairing(false);
      setPairedLocation(null);
      setCameraArmRequest(0);
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
          setMessage({ tone: 'success', text: `Picked ${line.units.length} × ${line.title}` });
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

  /** Pair the line's open units to the scanned location — the same write the unit hub's "Move to bin" makes (`POST /api/serial-units/:id/move`: */
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
          text: `${line.title} paired to ${locationFace(paired)}${open.length > 1 ? ` · ${open.length} units` : ''}`,
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
      const paired = await v1Request(`/api/v1/picking/sessions/${data.sessionId}/tote`, pickToteSchema, {
        method: 'POST',
        body: { orderId: order.orderId, toteScan: ref },
        fallbackMessage: 'Could not pair tote',
      });
      feedback('success');
      setToteByOrder((prev) => ({ ...prev, [order.orderId]: paired.toteCode }));
      setMessage({ tone: 'success', text: `Tote ${paired.toteCode} paired to ${order.orderLabel}` });
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
      if (!value || busy || scanPaused || shortOpen || notesOpen || passOpen || !line || !order) return;
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
          setMessage({ tone: 'error', text: `Scanned "${value}" — not ${line.title}` });
          return;
        }
        void confirmUnit(allocationId);
      }
    },
    [busy, scanPaused, shortOpen, notesOpen, passOpen, line, order, step, picked, confirmUnit, pairing, pairBin, armTote],
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
      try {
        await v1Request(`/api/v1/picking/sessions/${data.sessionId}/notes`, pickNoteSchema, {
          method: 'POST',
          body: { allocationIds: line.units.map((u) => u.allocationId), text },
          fallbackMessage: 'Note not saved',
        });
      } catch (err) {
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Note not saved' });
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
    skipped.current = [];
    try {
      window.sessionStorage.removeItem(RUN_KEY);
      window.sessionStorage.removeItem(SKIP_KEY);
    } catch {
      /* private mode — nothing kept */
    }
  }, []);

  const skip = useCallback(async () => {
    if (!order || !user) return;
    setBusy(true);
    try {
      await releaseOrder(order.orderId);
      if (order.owner?.via === 'assigned' && order.owner.staffId === user.staffId) {
        await assignOrder({ orderId: order.orderId, pickerId: 0 });
      }
      skipped.current = [...new Set([...skipped.current, order.orderId])];
      writeSkipped(skipped.current);
      setMessage({ tone: 'info', text: `Skipped ${order.orderLabel}` });
      await fetchNext();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Skip failed — try again' });
    } finally {
      setBusy(false);
    }
  }, [order, user, assignOrder, fetchNext]);

  const passTo = useCallback(
    async (staff: { id: number; name: string }) => {
      if (!order) return;
      setBusy(true);
      try {
        await assignOrder({ orderId: order.orderId, pickerId: staff.id, pickerName: staff.name });
        await releaseOrder(order.orderId);
        setPassOpen(false);
        setMessage({ tone: 'success', text: `Passed ${order.orderLabel} to ${staff.name}` });
        await fetchNext();
      } catch (err) {
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Pass failed — try again' });
      } finally {
        setBusy(false);
      }
    },
    [order, assignOrder, fetchNext],
  );

  return {
    isLoaded,
    signedIn: Boolean(user),
    viewerStaffId: user?.staffId ?? null,
    loading,
    loadError,
    retry: fetchNext,
    data,
    order,
    line,
    tote,
    step,
    scanLabel: busy ? 'Saving…' : pairing ? 'Scan bin to pair' : directedPickScanLabel(step, line, picked.size),
    pickedCount: picked.size,
    busy,
    message,
    dismissMessage: () => setMessage(null),
    elapsed,
    cameraArmRequest,
    shortOpen,
    setShortOpen,
    notesOpen,
    setNotesOpen,
    passOpen,
    setPassOpen,
    handleScan,
    handleShort,
    saveNote,
    skip,
    passTo,
    pairing,
    startPairing: () => {
      setPairing(true);
      setMessage(null);
      setCameraArmRequest((n) => n + 1);
    },
    cancelPairing: () => setPairing(false),
    endRun,
  };
}

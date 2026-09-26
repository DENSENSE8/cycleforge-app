'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import type { ShortPickResult } from '@/components/mobile/picker/ShortPickSheet';
import { matchScanToTask, type PickOrder, type PickTask } from './picker-shared';
import { toteRefFromScan } from '@/lib/picking/tote-ref';
import { setScanSubject } from '@/lib/stations/scan-subject-store';
import { recordMobileSessionEntry } from '@/lib/mobile/mobile-session-feed';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';

/** Owns the mobile picker session: */
export function useMobilePicker() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderIdParam = params?.orderId;
  const orderId = Number(orderIdParam);
  const { user, isLoaded } = useAuth();
  const { execute: executeWmsCommand } = useWmsRealtime();
  const scanner = useBarcodeScanner();

  const [order, setOrder] = useState<PickOrder | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pickedAllocations, setPickedAllocations] = useState<Set<number>>(() => new Set());
  const [shortSheetOpen, setShortSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMatched, setScanMatched] = useState(false);
  /** The tote (H-… plate) armed for this session — picks land in it. */
  const [toteRef, setToteRef] = useState<string | null>(null);
  /** First tote staged by session complete — shown on the success card. */
  const [stagedTote, setStagedTote] = useState<string | null>(null);

  // ── Bounce to signin
  useEffect(() => {
    if (isLoaded && !user) {
      router.replace(`/signin?next=/m/pick${orderIdParam ? `/${orderIdParam}` : ''}`);
    }
  }, [isLoaded, user, router, orderIdParam]);

  // ── Camera lifecycle
  useEffect(() => {
    if (!user) return;
    void scanner.startScanning();
    return () => {
      void scanner.stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Bootstrap: fetch tasks + open session
  useEffect(() => {
    if (!user) return;
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setLoadError('No order specified.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [tasksRes, sessionRes] = await Promise.all([
          fetch(`/api/orders/${orderId}/pick-tasks`, { cache: 'no-store' }),
          fetch('/api/picking/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId }),
          }),
        ]);
        if (!tasksRes.ok) throw new Error(`pick-tasks ${tasksRes.status}`);
        if (!sessionRes.ok) throw new Error(`session ${sessionRes.status}`);
        const tasks = await tasksRes.json();
        const session = await sessionRes.json();
        if (cancelled) return;
        if (!tasks.ok) throw new Error(tasks.error || 'pick-tasks failed');
        if (!session.ok) throw new Error(session.error || 'session start failed');
        setOrder({
          orderId: tasks.orderId,
          orderLabel: tasks.orderLabel,
          customerInitials: tasks.customerInitials,
          shipByDate: tasks.shipByDate,
          tasks: tasks.tasks,
        });
        setSessionId(session.sessionId);
        setScanSubject('order', String(orderId));
        // Skip already-PICKED rows when reopening a session.
        const firstOpen = tasks.tasks.findIndex(
          (t: PickTask) => t.currentState !== 'PICKED' && t.currentState !== 'PACKED' && t.currentState !== 'SHIPPED',
        );
        setCurrentIndex(firstOpen >= 0 ? firstOpen : tasks.tasks.length);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'load failed';
        setLoadError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orderId]);

  const currentTask = order?.tasks[currentIndex];
  const totalTasks = order?.tasks.length ?? 0;
  const doneCount = pickedAllocations.size;
  const allDone = totalTasks > 0 && doneCount >= totalTasks;

  const advance = useCallback(() => {
    if (!order) return;
    const next = order.tasks.findIndex(
      (t, i) => i > currentIndex && !pickedAllocations.has(t.allocationId),
    );
    setCurrentIndex(next >= 0 ? next : order.tasks.length);
    setDetailsExpanded(false);
  }, [order, currentIndex, pickedAllocations]);

  // ── Confirm pick through the persistent execution socket. The deterministic
  // command id makes a reconnect retry resolve to the original domain event.
  const handleConfirmPick = useCallback(async () => {
    if (!currentTask || sessionId == null || !user) return;
    const serialGate = Boolean(currentTask.serialNumber?.trim());
    if (serialGate && !scanMatched) {
      setScanError('Scan this unit first.');
      return;
    }
    if (!toteRef) {
      setScanError('Scan the tote for this order first — aim at its H-… plate.');
      return;
    }
    setConfirming(true);
    // Optimistic — mark done, advance, reconcile on rejection.
    const allocationId = currentTask.allocationId;
    setPickedAllocations((prev) => {
      const next = new Set(prev);
      next.add(allocationId);
      return next;
    });
    try {
      const wasLast = currentIndex >= totalTasks - 1;
      const receipt = await executeWmsCommand({
        v: 1,
        commandId: `pick:${sessionId}:${allocationId}`,
        organizationId: user.organizationId,
        staffId: user.staffId,
        issuedAt: new Date().toISOString(),
        name: 'pick.confirm',
        input: {
          sessionId,
          allocationId,
          toteScan: toteRef,
          completeSession: wasLast,
        },
      });
      recordMobileSessionEntry({
        id: `pick-${sessionId}-${allocationId}`,
        job: 'pick',
        title: currentTask.productTitle,
        identifier: currentTask.serialNumber || currentTask.sku,
        entityId: String(allocationId),
        state: 'done',
        href: `/m/pick/${orderIdParam}`,
        at: new Date().toISOString(),
        dedupeKey: `pick:${allocationId}`,
      });
      // If this was the last open task, complete the session — the tote(s)
      // paired to this order flip to STAGED for the pack station.
      if (wasLast) {
        const staged = Array.isArray(receipt.data.stagedTotes) ? receipt.data.stagedTotes : [];
        if (staged.length > 0) setStagedTote(String(staged[0]));
      } else {
        advance();
      }
    } catch (err) {
      // Roll back the optimistic mark and surface the server's operator-
      // readable reason (tote conflicts read "already carries another order…").
      setPickedAllocations((prev) => {
        const next = new Set(prev);
        next.delete(allocationId);
        return next;
      });
      setScanError(err instanceof Error ? err.message : 'Pick failed — try again.');
    } finally {
      setConfirming(false);
    }
  }, [currentTask, sessionId, user, currentIndex, totalTasks, executeWmsCommand, advance, scanMatched, toteRef, orderIdParam]);

  // ── Record short pick through the same execution socket.
  const handleShortPick = useCallback(
    async (result: ShortPickResult) => {
      if (!currentTask || sessionId == null || !user) return;
      const allocationId = currentTask.allocationId;
      // Optimistic mark.
      setPickedAllocations((prev) => {
        const next = new Set(prev);
        next.add(allocationId);
        return next;
      });
      try {
        await executeWmsCommand({
          v: 1,
          commandId: `short:${sessionId}:${allocationId}`,
          organizationId: user.organizationId,
          staffId: user.staffId,
          issuedAt: new Date().toISOString(),
          name: 'pick.short',
          input: {
            sessionId,
            allocationId,
            pickedQty: result.pickedQty,
            plannedQty: result.plannedQty,
            reason: result.reason,
            note: result.note,
          },
        });
        advance();
      } catch (err) {
        setPickedAllocations((prev) => {
          const next = new Set(prev);
          next.delete(allocationId);
          return next;
        });
        console.error('[m/pick] short-pick failed:', err);
      }
    },
    [currentTask, sessionId, user, executeWmsCommand, advance],
  );

  // ── Scan-gate. Optional confirm: a matching scan arms the dock.
  //    Serial-bearing units still require that match before confirm-pick.
  const handleScanDecode = useCallback(
    (value: string) => {
      if (!currentTask || confirming) return;
      const matched = matchScanToTask(value, currentTask);
      if (!matched) {
        // Not this pick — a tote plate arms the session container instead of
        // erroring, so the picker's tote scan is a first-class verb.
        const tote = toteRefFromScan(value);
        if (tote) {
          setToteRef(tote);
          setScanError(null);
          return;
        }
        const expectedBits = [
          currentTask.bin ? `bin ${currentTask.bin}` : null,
          currentTask.serialNumber ? (currentTask.productTitle || currentTask.sku) : null,
        ].filter(Boolean);
        setScanMatched(false);
        setScanError(
          expectedBits.length > 0
            ? `Scanned "${value.trim()}" — expected ${expectedBits.join(' or ')}.`
            : `Scanned "${value.trim()}" — doesn't match this pick.`,
        );
        return;
      }
      setScanError(null);
      setScanMatched(true);
    },
    [currentTask, confirming],
  );

  // Clear stale error whenever the user moves to a new task.
  useEffect(() => {
    setScanError(null);
    setScanMatched(false);
  }, [currentTask?.allocationId]);

  return {
    isLoaded, user,
    order, loadError,
    currentIndex,
    shortSheetOpen, setShortSheetOpen,
    confirming,
    detailsExpanded, setDetailsExpanded,
    scanError,
    scanRequired: Boolean(currentTask?.serialNumber?.trim()),
    scanMatched,
    scanner,
    currentTask, totalTasks, doneCount, allDone,
    handleConfirmPick, handleShortPick, handleScanDecode,
    toteRef,
    stagedTote,
  };
}

type MobilePickerController = ReturnType<typeof useMobilePicker>;

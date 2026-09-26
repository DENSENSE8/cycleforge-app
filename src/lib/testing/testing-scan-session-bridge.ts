'use client';

/** Testing scan bridge — sidebar scan band → middle workspace. */

import { useEffect, useState } from 'react';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ResolvedVia } from '@/lib/testing/resolve-testing-scan';
import {
  INITIAL_TESTING_SCAN_SESSION,
  type TestingScanSession,
} from '@/lib/testing/testing-scan-session';

/** Module-local: the publisher and the hook below are the only legal doors. */
const TESTING_SCAN_SESSION_EVENT = 'testing-scan-session-changed';

/** Last published session, kept module-level so a workspace that mounts AFTER the scan (the normal order — the scan is what opens the line)… */
let lastSession: TestingScanSession = INITIAL_TESTING_SCAN_SESSION;

export function publishTestingScanSession(session: TestingScanSession): void {
  lastSession = session;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TestingScanSession>(TESTING_SCAN_SESSION_EVENT, { detail: session }),
  );
}

/** Subscribe to the published session. Seeds from the last publish on mount. */
export function useTestingScanSession(): TestingScanSession {
  const [session, setSession] = useState<TestingScanSession>(lastSession);

  useEffect(() => {
    setSession(lastSession);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TestingScanSession>).detail;
      setSession(detail ?? INITIAL_TESTING_SCAN_SESSION);
    };
    window.addEventListener(TESTING_SCAN_SESSION_EVENT, handler);
    return () => window.removeEventListener(TESTING_SCAN_SESSION_EVENT, handler);
  }, []);

  return session;
}

/** Does this session describe the line the workspace currently has open? */
export function sessionMatchesLine(
  session: TestingScanSession,
  row: { id?: number | null; receiving_id?: number | null } | null | undefined,
): boolean {
  if (!row || session.phase === 'idle' || !session.line) return false;
  if (session.line.id != null && row.id != null) return session.line.id === row.id;
  if (session.line.receiving_id != null && row.receiving_id != null) {
    return session.line.receiving_id === row.receiving_id;
  }
  return false;
}

// ─── Pending multi-match pick ────────────────────────────────────────────────

/**
 * A scan that resolved to MORE THAN ONE candidate line (`kind: 'multi'` from
 * `resolveTestingScan`) — several serial matches, several pre-packed lines for
 * one SKU, several items on one PO.
 */
export interface TestingScanPick {
  rows: ReceivingLineRow[];
  via?: ResolvedVia;
  /** The raw scan that produced the ambiguity, echoed by the middle surface. */
  value: string;
}

const TESTING_SCAN_PICK_EVENT = 'testing-scan-pick-changed';
const TESTING_SCAN_PICK_RESOLVED_EVENT = 'testing-scan-pick-resolved';

let lastPick: TestingScanPick | null = null;

/** Publish (or clear) the pending choice. */
export function publishTestingScanPick(pick: TestingScanPick | null): void {
  lastPick = pick;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TestingScanPick | null>(TESTING_SCAN_PICK_EVENT, { detail: pick }),
  );
}

/** Subscribe to the pending choice. Seeds from the last publish on mount. */
export function useTestingScanPick(): TestingScanPick | null {
  const [pick, setPick] = useState<TestingScanPick | null>(lastPick);

  useEffect(() => {
    setPick(lastPick);
    const handler = (e: Event) => {
      setPick((e as CustomEvent<TestingScanPick | null>).detail ?? null);
    };
    window.addEventListener(TESTING_SCAN_PICK_EVENT, handler);
    return () => window.removeEventListener(TESTING_SCAN_PICK_EVENT, handler);
  }, []);

  return pick;
}

/** The middle → scan column direction: */
export function resolveTestingScanPick(row: ReceivingLineRow): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ReceivingLineRow>(TESTING_SCAN_PICK_RESOLVED_EVENT, { detail: row }),
  );
}

/** Scan-column side of {@link resolveTestingScanPick}. */
export function useTestingScanPickResolved(
  onResolved: (row: ReceivingLineRow) => void,
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const row = (e as CustomEvent<ReceivingLineRow>).detail;
      if (row) onResolved(row);
    };
    window.addEventListener(TESTING_SCAN_PICK_RESOLVED_EVENT, handler);
    return () => window.removeEventListener(TESTING_SCAN_PICK_RESOLVED_EVENT, handler);
  }, [onResolved]);
}

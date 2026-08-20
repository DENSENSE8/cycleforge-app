'use client';

/**
 * Testing scan bridge — sidebar scan band → middle workspace.
 *
 * Carries TWO computed values across the same tree boundary, with the same
 * one-publisher / one-hook / last-value-replay shape: the scan SESSION (below)
 * and the pending multi-match PICK (bottom of this file).
 *
 * The Testing scan column and the Testing workspace are sibling trees
 * (`TestingSidebarPanel` under `SidebarContextPanel`, `TestingPanel` under the
 * right pane), so the session state cannot be lifted to a common parent without
 * hoisting it above the whole app shell. This is the same shape the shipping
 * station already uses for its active order (`tech-active-order-changed` →
 * `useTechOrderPanes`) — one publisher, one window event, one subscriber hook.
 *
 * **Why the session has to reach the middle at all:** a Station renders its
 * active entity in exactly ONE region, and that region is the middle
 * (`display/station.md`; Unbox is the control — `ReceivingSidebarPanel` carries
 * no identity). The STN↔unit confirm state is the Testing bench's pass/fail
 * card, and it was the last thing drawing the carton a second time in the scan
 * column.
 *
 * **It is a MIRROR, never a second source.** The reducer in
 * `testing-scan-session.ts` stays the only place a session is computed; this
 * module only carries the computed value across the tree boundary.
 */

import { useEffect, useState } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ResolvedVia } from '@/lib/testing/resolve-testing-scan';
import {
  INITIAL_TESTING_SCAN_SESSION,
  type TestingScanSession,
} from '@/lib/testing/testing-scan-session';

/** Module-local: the publisher and the hook below are the only legal doors. */
const TESTING_SCAN_SESSION_EVENT = 'testing-scan-session-changed';

/**
 * Last published session, kept module-level so a workspace that mounts AFTER
 * the scan (the normal order — the scan is what opens the line) still sees it.
 * A pure event with no replay would deliver the session to an empty room every
 * time, which is the failure mode `station-workbench.md` documents for the
 * `requestAnimationFrame` dispatch that could not outrun a navigation.
 */
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

/**
 * Does this session describe the line the workspace currently has open?
 *
 * The workspace can be opened by a rail click or a URL, not only by a scan, so
 * a session left over from the previous carton would otherwise render a
 * confirm state for a unit that is not in the operator's hands — the exact
 * "two things that can disagree" failure the one-region rule exists to prevent.
 * Absent when it does not match, never stale.
 */
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

/**
 * Publish (or clear) the pending choice. The scan column raises it; the middle
 * displays it.
 *
 * **Why it crosses the boundary at all:** the choice is about which entity the
 * bench is about to work, and a Station renders its active entity in exactly
 * ONE region — the middle (`display/station.md` §11). A candidate list is also
 * literally the banned shape for the scan column ("don't put a browsable,
 * clickable list in the scan column"), which is where this one lived until
 * 2026-08-19: an amber block wedged above the recent rail, so an ambiguous scan
 * asked the operator to look away from the surface holding their work.
 */
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

/**
 * The middle → scan column direction: the operator chose `row`.
 *
 * The middle deliberately does NOT open the line itself. Opening a line also
 * anchors the scan session (tracking / unit-confirm dispatch), and the reducer
 * that owns the session lives in the scan column — the same rule the session
 * half of this module states: one derivation, one display. So the middle
 * reports the choice and the column applies it, exactly as if the scan had
 * resolved to a single line in the first place.
 */
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

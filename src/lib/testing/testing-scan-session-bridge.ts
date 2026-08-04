'use client';

/**
 * Testing scan-session bridge — sidebar scan band → middle workspace.
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

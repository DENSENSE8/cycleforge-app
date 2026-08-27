'use client';

/**
 * ServiceWorkspaceShell — the Workbench branch `service-workspace` frame.
 *
 *   ┌────────────┬──────────────────────────┐  ┌─────────────────┐
 *   │ list       │ thread (focus surface)   │  │ context         │
 *   │ queue map  │ + composer dock          │  │ RightRailHost   │
 *   └────────────┴──────────────────────────┘  └─────────────────┘
 *          the shell's two slots                 not the shell's
 *
 *
 * THE SHELL HAS TWO SLOTS, AND THE THIRD PANE IS NOT ONE OF THEM. It rendered a
 * private `<aside>` for ticket context until 2026-08-01 — a second permanent
 * consumer of the right edge, which is precisely what `lib/right-rail/store.ts`
 * exists to prevent, and a duplicate of `SupportContextDetailPanel`, which was
 * already registering the same `SupportContextHub` correctly. The context now
 * arrives through `RightRailHost` like every other record inspector; the host
 * owns the geometry, so this shell holds none.
 *
 * THE CONTRACT THIS SHELL EXISTS TO ENFORCE: **the list stays mounted.**
 * `SupportTicketsWorkspace` used to return the board *or* the ticket focus, so
 * opening a ticket unmounted the queue and threw away its scroll position, page,
 * and in-flight search — on the surface whose whole loop is working a queue.
 * This shell never unmounts `list`; when the thread covers it, it is hidden with
 * `display:none` (+ `inert`), the keep-alive recipe `workbench.md` prescribes and
 * `ReceivingRightPane` references.
 *
 * STAGED, AND HONESTLY SO: today the thread *covers* the list rather than
 * sitting beside it. Side-by-side needs a compact queue list, and the board's
 * chrome (status tabs + search + sort + pagination) does not survive a ~380px
 * column — building one now would mean two lists over one queue with
 * independent sort/page state, which is the drift the house rules ban. Lifting
 * the board's state is the prerequisite; when it lands, this becomes a slot swap
 * (`list` gets the compact list, `listHidden` goes away) and nothing else here
 * changes.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';


import {
  SERVICE_WORKSPACE_LIST_CLASS,
  SERVICE_WORKSPACE_ROOT_CLASS,
  SERVICE_WORKSPACE_THREAD_CLASS,
} from './service-workspace-layout';

interface ServiceWorkspaceShellProps {
  /** The queue map. Rendered on every pass — the shell never unmounts it. */
  list: ReactNode;
  /** Hide (never unmount) the list while the thread holds the surface. */
  listHidden?: boolean;
  /**
   * The focus surface. Crossfades on `threadKey`; `null` leaves the list alone.
   * Key on the RECORD id — that is the one thing that should trigger the swap.
   */
  thread?: ReactNode;
  threadKey?: string | number | null;
}

export function ServiceWorkspaceShell({
  list,
  listHidden = false,
  thread,
  threadKey,
}: ServiceWorkspaceShellProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // `inert` is a property, not a React-known attribute on every version in the
  // tree — set it imperatively so a hidden queue cannot take focus or be read
  // out by a screen reader while the thread owns the surface.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (listHidden) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
  }, [listHidden]);

  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  // NOT `swap.scan`: that 0.12s / `duration: 0` exit pair is the station-cadence
  // contract for swapping physical cartons at a bench, and borrowing it here
  // would re-import the grammar this branch exists to remove.
  const { presence: threadMotion, transition: threadTransition } = useMotionRole(
    motionRole.swap.focus,
  );

  return (
    <div className={SERVICE_WORKSPACE_ROOT_CLASS}>
      {/* The map. Always mounted — display, never presence. */}
      <div
        ref={listRef}
        className={SERVICE_WORKSPACE_LIST_CLASS}
        style={{ display: listHidden ? 'none' : undefined }}
      >
        {list}
      </div>

      {thread != null ? (
        <div className={SERVICE_WORKSPACE_THREAD_CLASS}>
          {/* Only the thread crossfades. The map above does not animate. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={threadKey ?? 'thread'}
              className="flex h-full min-h-0 w-full flex-col"
              initial={threadMotion.initial}
              animate={threadMotion.animate}
              exit={threadMotion.exit}
              transition={threadTransition}
            >
              {thread}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

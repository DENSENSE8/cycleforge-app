'use client';

/** ServiceWorkspaceShell — the Workbench branch `service-workspace` frame. */

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

  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as one pair so the presence can never drift onto another job's…
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

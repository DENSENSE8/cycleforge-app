'use client';

/**
 * /o layout — workbench shell for the dedicated order workspace.
 *
 * The master `DashboardSidebar` already mounts `OrderWorkspaceSidebar` when
 * `getSidebarRouteKey` resolves to `order`. This layout only owns the right
 * pane: a full-height detail region that crossfades when the path order id
 * changes (workbench rule — transition the workspace, keep the map stable).
 */

import { useMemo, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';

export default function OrderWorkspaceLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ orderId?: string }>();
  const orderKey = useMemo(() => {
    const raw = params?.orderId;
    const id = Array.isArray(raw) ? raw[0] : raw;
    return id ? decodeURIComponent(id) : 'order';
  }, [params?.orderId]);

  const pane = useMotionPresence(framerPresence.workbenchPane);
  const transition = useMotionTransition(framerTransition.workbenchPaneMount);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={orderKey}
          initial={pane.initial}
          animate={pane.animate}
          exit={pane.exit}
          transition={transition}
          className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

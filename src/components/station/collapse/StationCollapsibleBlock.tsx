'use client';

/**
 * A collapsible centre block — flush eyebrow header + height-collapsing body.
 *
 * Promoted from the page-local disclosure header inside `CartonInspectionPage`
 * (same face: eyebrow · chevron · trailing count/action) so the Search &amp;
 * Details centre composes it instead of growing a second one.
 *
 * **Carries no outer padding.** The block is a structural wrapper in a
 * zero-padding shell; its header owns its own row height and the body's padding
 * belongs to whatever is rendered inside it.
 *
 * Collapse is driven by the host (`useAutoCollapse`), never by local state —
 * the whole point is that several blocks collapse together on one signal.
 */

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { ChevronDown } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function StationCollapsibleBlock({
  label,
  count,
  action,
  collapsed,
  onToggle,
  children,
  bodyClassName,
  testId,
}: {
  label: string;
  /** Trailing count — omit rather than paint a zero the operator must decode. */
  count?: number | null;
  action?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  bodyClassName?: string;
  testId?: string;
}) {
  const presence = useMotionPresence(framerPresence.collapseHeight);
  const transition = useMotionTransition(framerTransition.stationCollapse);
  const face =
    'inline-flex min-w-0 items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-soft';

  return (
    <section data-testid={testId} data-collapsed={collapsed || undefined}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          // Stable hook for the disclosure itself. Block bodies legitimately
          // contain other `aria-expanded` controls (the condition chip inside
          // Items is one), so "any aria-expanded in this subtree" is not a way
          // to find the toggle.
          data-collapse-toggle
          aria-expanded={!collapsed}
          className={cn('ds-raw-button rounded-md text-left', face, focusRing('control', 'accent'))}
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
              !collapsed && 'rotate-180',
            )}
          />
          {label}
        </button>

        <span className="flex shrink-0 items-center gap-1">
          {count != null ? (
            <span className="text-role-micro uppercase tracking-widest tabular-nums text-text-faint">
              {count}
            </span>
          ) : null}
          {action}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            key="body"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className="overflow-hidden"
          >
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

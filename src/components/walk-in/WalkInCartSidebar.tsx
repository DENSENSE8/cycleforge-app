'use client';

/**
 * Walk-In counter cart sidebar — the shared staged-cart picker.
 *
 * One shell for every Walk-In job whose sidebar is "staged lines + footer
 * submit" (Sales → `SalesCartSidebar`). Local Pickup graduated to Receiving
 * and reuses Unbox/History SoTs — no parallel cart sidebar. Both Sales (and
 * formerly pickup) previously carried their own copy of this column — same
 * header band, same dashed empty box, same AnimatePresence row stack, same
 * subtotal + submit + error footer — differing only in copy, the row's
 * trailing meta cells, and the money formatter. This is the single shape for
 * that one job; the callers stay thin adapters over their own store.
 *
 * The shell owns chrome only. Selection, cart state, and the submit CTA belong
 * to the job's store — a job passes rows as children and its own footer.
 *
 * Repair's sidebar is NOT this job (queue navigator, not a staged cart) and
 * composes `RepairSidebarPanel` instead — see `WalkInStationSidebar`.
 */

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Package, ShoppingCart } from '@/components/Icons';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';

interface WalkInCartSidebarProps {
  /** Station-identity eyebrow, e.g. "Walk-In Sale". */
  eyebrow: string;
  /** Job title under the eyebrow, e.g. "New Sale". */
  title: string;
  /** Row stack — map lines to {@link WalkInCartRow}. Empty renders the teaching box. */
  children: ReactNode;
  /** True when the cart holds no lines; swaps the row stack for the empty box. */
  isEmpty: boolean;
  /** Formatted subtotal; omitted (with `isEmpty`) it hides the subtotal band. */
  subtotal?: string | null;
  /** The job's submit control — a `Button`, or a `role="status"` success band. */
  footer: ReactNode;
  /** Submit failure, rendered under the footer control. */
  error?: string | null;
}

export function WalkInCartSidebar({
  eyebrow,
  title,
  children,
  isEmpty,
  subtotal,
  footer,
  error,
}: WalkInCartSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
      <div className="border-b border-border-hairline px-3 py-2.5">
        <p className="text-role-eyebrow uppercase tracking-widest text-emerald-500">
          {eyebrow}
        </p>
        <h3 className="mt-0.5 text-role-caption font-semibold uppercase tracking-tight text-text-default">
          {title}
        </h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
        {isEmpty ? (
          <div className="mt-2 rounded-xl border border-dashed border-border-soft bg-surface-canvas/60 p-4 text-center">
            <ShoppingCart className="mx-auto mb-1 h-5 w-5 text-text-faint" />
            <p className="text-role-micro text-text-faint">
              Add items from the panel →
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>{children}</AnimatePresence>
          </div>
        )}
      </div>

      <div className="border-t border-border-hairline bg-surface-card px-3 py-2.5">
        <div className="space-y-2">
          {subtotal ? (
            <div className="flex items-center justify-between border-b border-border-hairline pb-2">
              <span className="text-role-micro uppercase tracking-wider text-text-soft">
                Subtotal
              </span>
              <span className="text-sm font-semibold text-emerald-600">{subtotal}</span>
            </div>
          ) : null}
          {footer}
          {error ? (
            <p className="text-center text-role-eyebrow text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface WalkInCartRowProps {
  /** Product thumbnail; falls back to the Package glyph. */
  imageUrl?: string | null;
  title: string;
  /** Formatted line price — each job owns its own money format. */
  price: string;
  quantity: number;
  /**
   * Trailing meta cells after the qty, e.g. pickup's condition + parts state or
   * sales' SKU. Push the last cell right with `ml-auto`.
   */
  meta?: ReactNode;
  active: boolean;
  onSelect: () => void;
}

/**
 * One staged line. Selection is background + ring only — row content and height
 * stay identical across states so the stack never shifts (house one-row rule).
 *
 * `ds-raw-button`: the whole tile is the hit target and carries the selected
 * treatment. `CardShell` is the wrong sibling here — it renders a `motion.div`
 * (no keyboard semantics) built for separator-joined rows in a stack, not
 * discrete rounded tiles.
 */
export function WalkInCartRow({
  imageUrl,
  title,
  price,
  quantity,
  meta,
  active,
  onSelect,
}: WalkInCartRowProps) {
  const presence = useMotionPresence(framerPresence.upNextRow);
  const transition = useMotionTransition(framerTransition.upNextRowMount);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={presence.initial}
      animate={presence.animate}
      exit={presence.exit}
      transition={transition}
      className={`ds-raw-button w-full rounded-xl border p-2 text-left transition-colors ${
        active
          ? 'border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200'
          : 'border-border-soft bg-surface-card hover:bg-surface-hover'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <Package className="h-5 w-5 text-text-faint" />
          )}
        </div>
        <p className="min-w-0 flex-1 truncate text-role-caption font-semibold leading-snug text-text-default">
          {title}
        </p>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-role-eyebrow">
        <span className="font-semibold text-emerald-700">{price}</span>
        <span className="font-semibold text-text-soft">x{quantity}</span>
        {meta}
      </div>
    </motion.button>
  );
}

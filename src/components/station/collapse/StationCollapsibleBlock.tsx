'use client';

/**
 * The station centre block face — flush eyebrow header, optionally a
 * height-collapsing body.
 *
 * Promoted from the page-local disclosure header inside `CartonInspectionPage`
 * (same face: eyebrow · chevron · trailing count/action) so the Search &amp;
 * Details centre composes it instead of growing a second one. That retirement
 * was prose-only until 2026-08-21 — carton kept its `SectionLabel` fork, with
 * the same `face` string and the same chevron, byte for byte.
 *
 * ## Two exports, because there are two jobs
 *
 * {@link StationCollapsibleBlock} is a DISCLOSURE: header + a body it owns and
 * removes from the tree when collapsed.
 *
 * {@link StationBlockLabel} is the header ALONE, for the two shapes a
 * disclosure cannot serve without lying:
 *   • a plain section label with no toggle at all (carton's Purchase orders ·
 *     Note · Record · Progress · Findings · History);
 *   • a header whose body is a SWAP rather than a collapse — carton's Activity
 *     shows the newest event when "closed" and the full list when open, so
 *     wrapping it in the block would delete the one row it exists to show.
 *
 * **Carries no outer padding.** The block is a structural wrapper in a
 * zero-padding shell; its header owns its own row height and the body's padding
 * belongs to whatever is rendered inside it.
 *
 * Collapse is driven by the host (`useAutoCollapse`), never by local state —
 * the whole point is that several blocks collapse together on one signal.
 *
 * **The collapse is INSTANT — no height animation** (operator rule,
 * 2026-08-22; see AGENTS.md → "No layout animations"). It used to tween height
 * through `AnimatePresence`, and on a tall body that tween is exactly the wrong
 * thing twice over: it costs a multi-hundred-millisecond reflow storm on the
 * one interaction whose entire purpose is to GIVE BACK space in a hurry, and
 * for the duration of it the block still occupies its full height — so an
 * operator who collapses a 1100px Status block watches it slide instead of
 * getting their thread back. Show it or do not.
 */

import type { ReactNode } from 'react';
import { ChevronDown } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const LABEL_FACE =
  'inline-flex min-w-0 items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-soft';

export function StationBlockLabel({
  label,
  count,
  action,
  open,
  onToggle,
}: {
  label: string;
  /**
   * Trailing count — omit rather than paint a zero the operator must decode.
   * `ReactNode`, not `number`: carton's Activity header counts in WORDS
   * (`12 events`) and its Contents header carries a totals summary string, and
   * a numeric-only prop silently dropped both.
   */
  count?: ReactNode;
  action?: ReactNode;
  /** Disclosure state. Omit together with {@link onToggle} for a plain label. */
  open?: boolean;
  /**
   * Omit for a label-only header. Also legitimately CONDITIONAL: carton's
   * Activity offers the toggle only when there is more than one event, and a
   * required handler forced a no-op button onto a header with nothing to open.
   */
  onToggle?: () => void;
}) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          // Stable hook for the disclosure itself. Block bodies legitimately
          // contain other `aria-expanded` controls (the condition chip inside
          // Items is one), so "any aria-expanded in this subtree" is not a way
          // to find the toggle.
          data-collapse-toggle
          aria-expanded={open}
          className={cn('ds-raw-button rounded-md text-left', LABEL_FACE, focusRing('control', 'accent'))}
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
          {label}
        </button>
      ) : (
        <span className={LABEL_FACE}>{label}</span>
      )}

      <span className="flex shrink-0 items-center gap-1">
        {count != null ? (
          <span className="text-role-micro uppercase tracking-widest tabular-nums text-text-faint">
            {count}
          </span>
        ) : null}
        {action}
      </span>
    </div>
  );
}

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
  count?: ReactNode;
  action?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    // `shrink-0` unconditionally: in a bounded centre column the flexible
    // sibling (a thread) must absorb the slack, never this block. Every host
    // wants that, so it is not a prop.
    <section data-testid={testId} data-collapsed={collapsed || undefined} className="shrink-0">
      <StationBlockLabel
        label={label}
        count={count}
        action={action}
        open={!collapsed}
        onToggle={onToggle}
      />

      {collapsed ? null : <div className={bodyClassName}>{children}</div>}
    </section>
  );
}

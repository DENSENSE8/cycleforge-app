'use client';

import { Fragment, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  ArrowRightToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  List,
  X,
} from '../../Icons';
import { HoverTooltip } from '../HoverTooltip';
import { ToolbarButton } from '../ToolbarButton';
import { IconButton } from '@/design-system/primitives';
import { Popover } from '@/design-system';
import { TOOLBAR_LISTBOX_PANEL_CLASS } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import {
  PRIMARY_CHROME_ROW_FACE,
  receivingHeaderHairlineClass,
} from '@/components/layout/header-shell';
import { RECEIVING_WORKSPACE_HEADER_COLUMN } from '@/components/receiving/workspace/receiving-workspace-layout';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// ─── PaneHeaderLabel ────────────────────────────────────────────────────────
// Small uppercase eyebrow over a bold value — the "PO · LINE 1 OF 2" /
// "381390806373" shape used in detail panes.

interface PaneHeaderLabelProps {
  /** Small uppercase tracking line (e.g. "PO · LINE 1 OF 2"). */
  eyebrow?: ReactNode;
  /** Bold value (e.g. an identifier, SKU, tracking number). */
  value: ReactNode;
  valueTitle?: string;
  valueClassName?: string;
  eyebrowClassName?: string;
}

export const paneHeaderLabelEyebrowClass =
  'text-role-eyebrow uppercase tracking-widest text-text-faint';

export const paneHeaderLabelValueClass =
  'truncate text-sm font-semibold tracking-tight text-text-default';

export function PaneHeaderLabel({
  eyebrow,
  value,
  valueTitle,
  valueClassName = paneHeaderLabelValueClass,
  eyebrowClassName = paneHeaderLabelEyebrowClass,
}: PaneHeaderLabelProps) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      {eyebrow ? <span className={eyebrowClassName}>{eyebrow}</span> : null}
      {/* ds-allow-title: native OS tooltip shows the full value when truncated */}
      <span className={valueClassName} title={valueTitle}>
        {value}
      </span>
    </div>
  );
}

// ─── PaneHeaderTitle ────────────────────────────────────────────────────────
// Single bold title — matches the WeekHeader "today" / sticky-date display.

const paneHeaderHighContrastTitleClass =
  'text-sm font-semibold uppercase tracking-widest text-text-default';

interface PaneHeaderTitleProps {
  children: ReactNode;
  className?: string;
}

export function PaneHeaderTitle({ children, className }: PaneHeaderTitleProps) {
  return (
    <p className={cn('min-w-0 truncate', paneHeaderHighContrastTitleClass, className)}>
      {children}
    </p>
  );
}

// ─── PaneHeaderCount ────────────────────────────────────────────────────────
// Tabular blue count — same look as WeekHeader's count badge.

interface PaneHeaderCountProps {
  count: number;
  className?: string;
}

export function PaneHeaderCount({ count, className }: PaneHeaderCountProps) {
  return (
    <p className={cn('shrink-0 font-dm-sans text-sm font-semibold tabular-nums text-blue-700', className)}>
      {count}
    </p>
  );
}

// ─── PaneHeaderIconBadge ────────────────────────────────────────────────────
// Rounded square icon badge (e.g. the blue pin in the receiving header).

interface PaneHeaderIconBadgeProps {
  Icon: IconComponent;
  /** Background tone class — e.g. `bg-blue-50`, `bg-rose-50`. */
  bg?: string;
  /** Foreground/icon tone class — e.g. `text-blue-600`. */
  tint?: string;
  size?: 'sm' | 'md';
  /** Corner rounding — defaults to `xl` (matches receiving header); use `lg` for the tighter tech-station look. */
  rounded?: 'lg' | 'xl';
  className?: string;
}

export function PaneHeaderIconBadge({
  Icon,
  bg = 'bg-blue-50',
  tint = 'text-blue-600',
  size = 'md',
  rounded = 'xl',
  className,
}: PaneHeaderIconBadgeProps) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const radius = rounded === 'lg' ? 'rounded-lg' : 'rounded-xl';
  return (
    <span className={cn('flex shrink-0 items-center justify-center', box, radius, bg, tint, className)}>
      <Icon className={icon} />
    </span>
  );
}

// ─── PaneHeaderCloseButton ──────────────────────────────────────────────────
// Dismiss control for a detail pane. Leads the trailing cluster
// (`close · up · down`) — see PaneHeaderActionBar's `onClose`.

interface PaneHeaderCloseButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  title?: string;
  className?: string;
  /**
   * `push` (default) — `ArrowRightToLine` (`>|`): this pane is parked back
   * against the right edge it came from. Every right-rail / push surface.
   * `dismiss` — the classic `X`, for a pane that genuinely goes away rather
   * than sliding aside.
   */
  intent?: 'push' | 'dismiss';
}

export function PaneHeaderCloseButton({
  onClick,
  ariaLabel = 'Close',
  title = 'Close',
  className,
  intent = 'push',
}: PaneHeaderCloseButtonProps) {
  return (
    <HoverTooltip label={title} asChild>
      <IconButton
        type="button"
        onClick={onClick}
        ariaLabel={ariaLabel}
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-surface-sunken active:scale-95',
          className,
        )}
        icon={
          intent === 'push' ? (
            <ArrowRightToLine className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )
        }
      />
    </HoverTooltip>
  );
}

// ─── PaneHeaderStatusPill ───────────────────────────────────────────────────
// Small status pill — sits inline next to the label/value to call out current
// state. Matches the Plain / Pylon / ops-dashboard pattern surfaced by 2026
// research (status as headline, not as right-meta sidebar like Linear).

type StatusTone = 'neutral' | 'blue' | 'emerald' | 'amber' | 'yellow' | 'rose' | 'red' | 'purple';

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-surface-sunken text-text-muted ring-border-soft',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
};

interface PaneHeaderStatusPillProps {
  children: ReactNode;
  tone?: StatusTone;
  /** Adds a pulsing dot on the left — use sparingly for "live"/"active" states. */
  pulse?: boolean;
  className?: string;
}

export function PaneHeaderStatusPill({
  children,
  tone = 'neutral',
  pulse,
  className,
}: PaneHeaderStatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
        STATUS_TONE_CLASS[tone],
        className,
      )}
    >
      {pulse ? (
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 animate-pulse rounded-full',
            tone === 'emerald' && 'bg-emerald-500',
            tone === 'blue' && 'bg-blue-500',
            tone === 'amber' && 'bg-amber-500',
            tone === 'yellow' && 'bg-yellow-400',
            tone === 'rose' && 'bg-rose-500',
            tone === 'red' && 'bg-red-500',
            tone === 'purple' && 'bg-purple-500',
            tone === 'neutral' && 'bg-slate-500', // ds-allow-raw-neutral: identity/tone hue — neutral pulse dot among colored tones
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

// ─── PaneHeaderTabs ─────────────────────────────────────────────────────────
// Segmented tab strip for the secondary row beneath the identity header — the
// dual-sticky pattern that Vercel/Front/operations dashboards converge on for
// detail panes with 3+ sub-views (e.g. Lines / Receiving / Audit / Photos).
// Render inside `PaneHeader`'s `belowSlot`.

interface PaneHeaderTab<TValue extends string> {
  value: TValue;
  label: ReactNode;
  count?: number;
}

interface PaneHeaderTabsProps<TValue extends string> {
  tabs: Array<PaneHeaderTab<TValue>>;
  value: TValue;
  onChange: (next: TValue) => void;
  className?: string;
  /**
   * Condensed strip — tighter padding + smaller type for panes where the tab row
   * competes for vertical space (e.g. the shipped slide-over, which pairs it with
   * an action bar and now a full-page launcher). Default keeps the roomy sizing
   * every existing consumer (Lines / Receiving / Audit / Photos) relies on.
   */
  dense?: boolean;
  /** Far-right affordance on the tab row (e.g. Open in unbox). */
  rightSlot?: ReactNode;
}

export function PaneHeaderTabs<TValue extends string>({
  tabs,
  value,
  onChange,
  className,
  dense = false,
  rightSlot,
}: PaneHeaderTabsProps<TValue>) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-between gap-2 bg-surface-card',
        dense ? 'px-1 py-0.5' : 'px-2 py-1',
        className,
      )}
    >
      <div
        role="tablist"
        className={cn(
          'flex min-w-0 items-center',
          dense ? 'gap-0.5' : 'gap-1',
        )}
      >
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            // ds-raw-button: segmented tab (role="tab" + aria-selected + active fill + count), not a Button/IconButton
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={cn(
                'ds-raw-button inline-flex items-center font-semibold transition-colors',
                dense
                  ? 'gap-1 rounded px-2 py-1 text-role-caption'
                  : 'gap-1.5 rounded-md px-3 py-1.5 text-xs',
                active
                  ? 'bg-surface-inverse text-white'
                  : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
              )}
            >
              <span>{tab.label}</span>
              {tab.count != null ? (
                <span
                  className={cn(
                    'tabular-nums',
                    active ? 'text-white/70' : 'text-text-faint',
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
    </div>
  );
}

// ─── PaneHeaderActionBar ────────────────────────────────────────────────────
// Horizontal utility toolbar — icon+label action buttons on the left, optional
// status indicator, optional prev/next chevrons on the right. The shape
// originated in `LineEditPanel`'s in-body toolbar (Refresh / Share / Audit /
// Copy + ↑ ↓) and has become the canonical action surface for detail panes.
// Use inside a PaneHeader's belowSlot or at the top of a panel body.

export interface PaneHeaderActionBarAction {
  key: string;
  label: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Selected/pressed state — highlights the button so the user sees which action's panel is open. */
  active?: boolean;
  /** Optional tone applied as a wrapper class around the icon — e.g. `'text-blue-600'`. */
  toneClassName?: string;
  /** Override the rendered title attribute. Defaults to `label`. */
  title?: string;
  /** Override the rendered aria-label. Defaults to `label`. */
  ariaLabel?: string;
  /**
   * Hairline before this action — Display | Edit topic groups on History peek
   * (`detail:history` golden). Prefer this over a second ActionBar + local rule.
   */
  dividerBefore?: boolean;
}

interface PaneHeaderActionBarProps {
  actions: PaneHeaderActionBarAction[];
  /** Optional aria-live status text (e.g. "Syncing", "Saving"). */
  status?: ReactNode;
  /**
   * Dismiss the panel. Renders {@link PaneHeaderCloseButton} as the LAST item of
   * the trailing cluster, so `up · down · close` is one right-aligned group by
   * construction — the SoT grammar (`source-of-truth.md` → Right-rail modality →
   * Panel header grammar), not something each header re-assembles.
   *
   * It lives here rather than in a host's `rightSlot` because it was the split
   * that caused the bug: close sat in the row ABOVE prev/next, so the two halves
   * of one cluster drifted apart and two headers ended up swallowing the prop
   * entirely. A non-modal panel has no scrim to click off, so this control is
   * mandatory on every record inspector.
   */
  onClose?: () => void;
  closeTitle?: string;
  /**
   * Card = rounded pill with subtle border + shadow. Flat = no chrome.
   * Header = full-width 30px band with a top hairline, matching the house
   * header rows (e.g. the workspace toolbar pinned beneath the stepper).
   */
  variant?: 'card' | 'flat' | 'header';
  /** Icon-only mode — hides text labels but preserves them as aria-label/title for accessibility. */
  iconOnly?: boolean;
  /** Custom node pinned to the left, before the action buttons (e.g. back-to-browse). */
  leftSlot?: ReactNode;
  /** Custom node pinned to the right, before the prev/next chevrons (e.g. an Info button). */
  rightSlot?: ReactNode;
  /** Extra classes applied to prev/next nav buttons (e.g. responsive hide). */
  navClassName?: string;
  className?: string;
}

const PANE_HEADER_ACTION_BTN_CLASS =
  'inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-role-micro uppercase tracking-widest text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default disabled:cursor-not-allowed disabled:opacity-40';

const PANE_HEADER_ACTION_NAV_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default disabled:cursor-not-allowed disabled:opacity-40';

export function PaneHeaderActionBar({
  actions,
  status,
  onClose,
  closeTitle = 'Close',
  variant = 'card',
  iconOnly = false,
  leftSlot,
  rightSlot,
  navClassName,
  className,
}: PaneHeaderActionBarProps) {
  const shell =
    variant === 'card'
      ? 'flex items-center gap-2 rounded-xl border border-border-soft/70 bg-surface-card px-3 py-1.5 shadow-sm'
      : 'flex items-center gap-2 px-2 py-1.5';

  const renderText = (value: ReactNode): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const content = (
    <>
      {leftSlot}
      {actions.map((action) => (
        <Fragment key={action.key}>
          {action.dividerBefore ? (
            <div
              className="mx-0.5 h-4 w-px shrink-0 bg-border-hairline"
              aria-hidden
            />
          ) : null}
          <HoverTooltip
            label={action.title ?? renderText(action.label) ?? action.key}
            asChild
          >
            {/* ds-raw-button: compact 28px toolbar action that is icon-only OR icon+label and wraps the icon in a per-action toneClassName span — Button's icon-box sizing can't preserve that */}
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.ariaLabel ?? renderText(action.label) ?? action.key}
              aria-pressed={action.active}
              className={cn(
                PANE_HEADER_ACTION_BTN_CLASS,
                iconOnly && 'h-7 w-7 justify-center gap-0 px-0',
                action.active &&
                  'bg-surface-sunken text-text-default ring-1 ring-inset ring-border-default hover:bg-surface-sunken',
              )}
            >
              <span className={cn('inline-flex items-center', action.toneClassName)}>{action.icon}</span>
              {iconOnly ? null : action.label}
            </button>
          </HoverTooltip>
        </Fragment>
      ))}
      {status != null ? (
        <span
          className="text-role-eyebrow uppercase tracking-[0.18em] text-blue-600"
          aria-live="polite"
        >
          {status}
        </span>
      ) : null}
      {/* Spacer only when the trailing cluster needs the far edge — rightSlot
          alone stays clustered with the actions (station context bar util row). */}
      {onClose && <div className="flex-1" />}
      {rightSlot}
      {/* Close is the whole trailing cluster now — the ↑↓ stepper was removed
          2026-08-19. Walking the queue from a record header duplicated the
          recents rail, which already owns the selection. */}
      {onClose ? (
        <PaneHeaderCloseButton
          onClick={onClose}
          title={closeTitle}
          ariaLabel={closeTitle}
          className="h-7 w-7 rounded-md"
        />
      ) : null}
    </>
  );

  // Header = full-width 40px white band with the house bottom hairline (matches
  // the other header rows for consistency). Its content sits in the SAME
  // centered max-w-3xl column as the stepper + body cards so the icons (left)
  // and chevrons (right) line up with the rest of the workspace.
  if (variant === 'header') {
    return (
      <div
        className={cn(
          'flex w-full items-center bg-surface-card',
          PRIMARY_CHROME_ROW_FACE,
          receivingHeaderHairlineClass,
          className,
        )}
      >
        <div className={cn(RECEIVING_WORKSPACE_HEADER_COLUMN, 'flex items-center gap-1')}>
          {content}
        </div>
      </div>
    );
  }

  return <div className={cn(shell, className)}>{content}</div>;
}

// ─── PaneHeaderPagination ─────────────────────────────────────────────────────
// Compact workbench trailing control — icon + range label + chevron, sibling of
// {@link QueueSortSwitch}. Prev/next live in the popover
// so the resting chrome stays one labeled pill. `iconOnly` drops the range /
// caret (Incoming Pipeline — Unbox triage density).

interface PaneHeaderPaginationProps {
  /** Current 1-based page index. */
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  /**
   * List glyph only — range lives in aria-label + HoverTooltip + the popover.
   * Incoming Pipeline icon-only chrome.
   */
  iconOnly?: boolean;
}

export function PaneHeaderPagination({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
  className,
  iconOnly = false,
}: PaneHeaderPaginationProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;
  const rangeLabel = total > 0 ? `${rangeStart}–${rangeEnd}` : '—';
  const tipLabel =
    total > 0 ? `${rangeLabel} of ${total.toLocaleString()}` : 'No results';
  const ariaLabel =
    total > 0
      ? `Page ${safePage} of ${totalPages}, showing ${rangeLabel} of ${total}`
      : 'No results';

  const trigger = (
    <ToolbarButton
      ref={buttonRef}
      type="button"
      iconOnly={iconOnly}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={() => setOpen((o) => !o)}
      className={iconOnly ? undefined : 'normal-case tracking-wide'}
    >
      <List className="h-3.5 w-3.5 shrink-0" />
      {iconOnly ? null : (
        <>
          <span className="whitespace-nowrap tabular-nums">{rangeLabel}</span>
          <ChevronDown
            className={cn('h-3 w-3 shrink-0 opacity-70 transition-transform', open && 'rotate-180')}
          />
        </>
      )}
    </ToolbarButton>
  );

  return (
    <div className={cn('shrink-0', className)} data-pane-header-pagination="">
      {iconOnly ? (
        <HoverTooltip label={tipLabel} asChild>
          {trigger}
        </HoverTooltip>
      ) : (
        trigger
      )}

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        placement="bottom-end"
        gap={4}
        matchWidth={false}
        padded={false}
        role="dialog"
        aria-label="Pagination"
        className={TOOLBAR_LISTBOX_PANEL_CLASS}
      >
        <div className="min-w-[11rem] px-2.5 py-2">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">Showing</p>
          <p className="mt-0.5 tabular-nums text-role-caption font-semibold text-text-default">
            {total > 0 ? (
              <>
                {rangeLabel}
                <span className="font-medium text-text-faint"> / {total.toLocaleString()}</span>
              </>
            ) : (
              '—'
            )}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <HoverTooltip label="Previous page" asChild>
              <IconButton
                type="button"
                onClick={() => canPrev && onPrev()}
                disabled={!canPrev}
                ariaLabel="Previous page"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                icon={<ChevronLeft className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
            <span className="tabular-nums text-role-eyebrow uppercase tracking-wider text-text-soft">
              <span className="text-text-default">{safePage}</span>
              <span className="text-text-faint"> / {totalPages}</span>
            </span>
            <HoverTooltip label="Next page" asChild>
              <IconButton
                type="button"
                onClick={() => canNext && onNext()}
                disabled={!canNext}
                ariaLabel="Next page"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                icon={<ChevronRight className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
          </div>
        </div>
      </Popover>
    </div>
  );
}

// ─── CursorPositionReadout ──────────────────────────────────────────────────
// `3 / 47` — where the open record sits in the collection that published the
// record cursor.
//
// **This is the point of the readout, not decoration.** A panel that can step
// has to say where it is, or the operator cannot tell a chevron that is disabled
// from one that is broken — which is exactly how the receiving details stack
// shipped two dead chevrons for months (`receiving-navigate-detail-overlay` had
// zero listeners; see `docs/todo/record-cursor-unification-PLAN.md` §2.1, §3.6).
//
// Renders nothing when no cursor is published (a panel opened from search, or a
// surface that has not migrated yet). A placeholder "1 / 1" would be a claim
// about a queue that does not exist — honest absence instead.
//
// Composed into `PaneHeaderActionBar`'s existing `rightSlot`, which paints
// immediately before the chevrons — never as a new prop on that shared
// primitive (`pattern-evolution.md` → Ask first). It lives here, beside that
// bar, because both order headers render it today and Phase 6 merges them into
// one `RecordPaneHeader`; a copy inside either consumer is a cross-family import
// for the other.

interface CursorPositionReadoutProps {
  position?: number | null;
  total?: number;
}

export function CursorPositionReadout({ position, total }: CursorPositionReadoutProps) {
  if (position == null || !total) return null;
  return (
    <span className="text-role-micro tabular-nums text-text-soft">
      {position} / {total}
    </span>
  );
}

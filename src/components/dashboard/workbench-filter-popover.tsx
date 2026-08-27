'use client';

/**
 * Workbench chrome filter popover — the icon-only [⫶] trigger + its menu rows,
 * shared by every `WorkbenchChromeHeader` `right` slot (Outbound lanes /
 * statuses, Inbound carton source / search field).
 *
 * Resting chrome is one glyph; labels, counts, and shortcuts live inside the
 * popover. A hot filter marks the trigger with a dot so an active refinement is
 * visible without opening it. Callers that need floor glanceability should also
 * render {@link WorkbenchFilterHotChip} beside the field when hot (dot alone
 * fails WCAG 1.4.1 / monitor glanceability).
 *
 * Extracted from `OutboundFilterStrip` when Inbound needed the same popover —
 * grow the shared primitive, don't fork a second menu.
 *
 * Also hosts **in-field** filters (`density="field"`) — same menu rows, paste-
 * sized trigger in a SearchField trailing slot (`trailingPrefix` or
 * `trailingSuffix`; Store order scope, Unbox rail facets, etc.).
 *
 * Keyboard contract (menu-button pattern, not combobox):
 * - Trigger is a `<button>` adjacent to / visually inside the search field.
 * - Enter/Space opens; Esc closes and returns focus to the trigger.
 * - Arrow keys move among {@link WorkbenchFilterMenuRow} options (Radix).
 * - Selecting a row closes the menu; focus restores to the trigger.
 * - Field density uses `onMouseDown` preventDefault on open so the search
 *   input keeps focus for Station scan-bar ownership until the menu claims it.
 */

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Filter, X } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarListboxOption } from '@/design-system/primitives';
import {
  FIELD_ACTION_CLASS,
  FIELD_ACTION_GLYPH_CLASS,
} from '@/design-system/primitives/field-action';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


export function WorkbenchFilterPopover({
  open,
  onOpenChange,
  hot,
  label,
  /** When hot, appended into aria-label — e.g. "Repair" → "Order scope (Repair active)". */
  hotActiveLabel,
  children,
  /** Override content width (default `w-56`). Use a wider class when the menu
   *  hosts date pickers / multi-column tables (e.g. Incoming PO date). */
  contentClassName,
  /**
   * Trigger glyph — **`toolbar` density only**. In the FIELD the glyph is the
   * Filter funnel and nothing else (see the one-icon law below), so a custom
   * icon passed with `density="field"` is ignored rather than honoured.
   */
  icon,
  /**
   * `toolbar` (default) — densified `h-7` ToolbarButton for chrome right clusters.
   * `field` — paste-sized glyph for SearchField trailing slots
   * (`trailingPrefix` left of paste, or `trailingSuffix` after paste/clear).
   */
  density = 'toolbar',
  retainSearchFocus = true,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** An active refinement — dots the trigger and keeps it lit while closed. */
  hot: boolean;
  label: string;
  hotActiveLabel?: string;
  children: ReactNode;
  contentClassName?: string;
  icon?: ReactNode;
  density?: 'toolbar' | 'field';
  /**
   * Field density: keep the find/scan input focused when opening (Station).
   * Packed passes false so the staff type-in field can take the caret.
   */
  retainSearchFocus?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);

  // Restore focus to the trigger when the menu closes (APG menu-button).
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  /**
   * **One icon in the find field, and it is the funnel.**
   *
   * A field glyph answers exactly one question — *does anything narrow these
   * rows?* — so it must be the same mark on every surface. Domain glyphs had
   * started answering a different one: To-ship and Shipping painted a
   * `PackageCheck` box for the packing-bench facet, and the staff facet paints a
   * `User`, so an operator moving between three desks met three different marks
   * for "refine" and no mark that meant it everywhere. A funnel that is
   * sometimes a box is not a funnel.
   *
   * `toolbar` density keeps the escape: out on a chrome row a popover sits
   * beside unrelated controls and its glyph is what distinguishes it.
   */
  const glyph =
    density === 'field' ? (
      <Filter className={FIELD_ACTION_GLYPH_CLASS} />
    ) : (
      icon ?? <Filter className={FIELD_ACTION_GLYPH_CLASS} />
    );
  const ariaLabel =
    hot && hotActiveLabel ? `${label} (${hotActiveLabel} active)` : label;
  const hotDot = hot ? (
    <span
      className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 ring-1 ring-surface-card"
      aria-hidden
    />
  ) : null;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        {density === 'field' ? (
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-label={ariaLabel}
            // Keep focus in the search field when opening the menu (Station
            // scan bar). Skip when the menu must steal focus for type-in.
            onMouseDown={retainSearchFocus ? (e) => e.preventDefault() : undefined}
            // `relative` hosts the hot dot; the rest is the shared in-field
            // action cell, so refine and paste stay peers by construction.
            className={cn(
              'ds-raw-button relative',
              FIELD_ACTION_CLASS,
              (open || hot) && 'text-blue-600',
            )}
          >
            <HoverTooltip label={ariaLabel} focusable={false} asChild>
              <span
                className={cn(
                  'relative inline-flex items-center justify-center leading-none',
                  FIELD_ACTION_GLYPH_CLASS,
                )}
              >
                {glyph}
                {hotDot}
              </span>
            </HoverTooltip>
          </button>
        ) : (
          <ToolbarButton
            ref={triggerRef}
            iconOnly
            active={open || hot}
            aria-expanded={open}
            aria-label={ariaLabel}
            className="h-7 w-7"
          >
            <HoverTooltip label={ariaLabel} focusable={false}>
              <span className="relative inline-flex">
                {glyph}
                {hotDot}
              </span>
            </HoverTooltip>
          </ToolbarButton>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          onOpenAutoFocus={(e) => {
            if (!retainSearchFocus) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            // We restore focus ourselves so field-density doesn't yank the
            // Station scan bar — prevent Radix default, then focus trigger.
            e.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          onInteractOutside={(event) => {
            const node = event.target;
            if (!(node instanceof Element)) return;
            if (
              node.closest('[cmdk-root]')
              || node.closest('[role="listbox"]')
              || node.closest('[data-radix-popper-content-wrapper]')
              || node.closest('.rdp')
            ) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            const node = event.target;
            if (!(node instanceof Element)) return;
            if (
              node.closest('[cmdk-root]')
              || node.closest('[role="listbox"]')
              || node.closest('[data-radix-popper-content-wrapper]')
              || node.closest('.rdp')
            ) {
              event.preventDefault();
            }
          }}
          className={cn(
            // Panel chrome matches the house `Popover` the sibling toolbar
            // dropdowns use (p-0.5 + shadow-md), so the three read as one menu.
            cn('z-dropdown overflow-hidden rounded-lg border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5', focusRing('field', 'accent')),
            contentClassName ?? 'w-56',
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Persistent chip shown beside a SearchField when a field-density filter is
 * hot (non-default). Clearable — `onClear` resets to the default scope.
 * Complements the 1.5px hot dot on {@link WorkbenchFilterPopover}.
 */
export function WorkbenchFilterHotChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 pl-1.5 pr-0.5 text-role-micro font-semibold text-blue-800">
      <span className="max-w-[6rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="ds-raw-button inline-flex h-4 w-4 items-center justify-center rounded text-blue-700 hover:bg-blue-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/** Section eyebrow inside a {@link WorkbenchFilterPopover}. */
export function WorkbenchFilterGroupLabel({ children }: { children: ReactNode }) {
  return (
    // px-2.5 aligns the eyebrow with the row label gutter below it.
    <p className="px-2.5 pb-1 pt-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
      {children}
    </p>
  );
}

/** Hairline between groups inside a {@link WorkbenchFilterPopover}. */
export function WorkbenchFilterDivider() {
  return <div className="my-1 h-px bg-surface-sunken" />;
}

/**
 * One filter row. Composes {@link ToolbarListboxOption} — the same anatomy as
 * `QueueSortSwitch`, so the trailing-cluster dropdowns
 * read as one control: an active row is a **leading blue check**, never a
 * `bg-surface-accent` fill. The status dot moves in beside the label; count and
 * shortcut ride the trailing slot.
 */
export function WorkbenchFilterMenuRow({
  label,
  count,
  active,
  onClick,
  leading,
  shortcut,
  sectionHeader = false,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  shortcut?: string;
  /**
   * Clickable default for an icon-bearing section (e.g. All types/platforms).
   * It replaces the separate eyebrow and starts flush: no check gutter,
   * leading-icon gutter, or row left padding.
   */
  sectionHeader?: boolean;
}) {
  return (
    <ToolbarListboxOption
      // A filter is independently on/off, not one choice among a listbox.
      semantics="toggle"
      selected={active}
      onClick={onClick}
      icon={sectionHeader ? <></> : undefined}
      leading={
        sectionHeader
          ? undefined
          : (leading ?? <span className="w-2 shrink-0" aria-hidden />)
      }
      className={sectionHeader ? 'px-0' : undefined}
      trailing={
        count === undefined && !shortcut ? null : (
          <span className="flex shrink-0 items-center gap-2">
            {typeof count === 'number' ? (
              <span className={cn('tabular-nums', active ? 'text-text-soft' : 'text-text-faint')}>
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
            {shortcut ? (
              <kbd className="hidden rounded bg-surface-sunken px-1 text-role-micro text-text-faint sm:inline">
                {shortcut}
              </kbd>
            ) : null}
          </span>
        )
      }
    >
      {label}
    </ToolbarListboxOption>
  );
}

/**
 * Faceted tab strip for a {@link WorkbenchFilterPopover} — the refine funnel's
 * top row, where one facet body shows at a time.
 *
 * **Why this is a component and not two copies.** `UnboxWorkspaceHeader` grew
 * the same 30-line `role="tablist"` twice — History refine and triage refine —
 * with byte-identical tab classes, the identical `onMouseDown` preventDefault,
 * and the identical hot dot. Two copies of an a11y-bearing control is two places
 * for `aria-selected` or the keep-open behavior to drift.
 *
 * **The `onMouseDown` preventDefault is load-bearing, not a tic.** Switching a
 * facet must not blur the field the popover is anchored to — a blur closes the
 * popover, so without it the funnel shuts on the first facet click.
 *
 * A single facet renders **nothing**: a one-tab tablist is chrome that cannot
 * navigate anywhere, and it spends a row of a 72-wide popover saying so.
 *
 * Not for the flat grouped-row refine (`HistoryWorkspaceHeader`), which lists
 * every group at once instead of tabbing between them — a different shape, and
 * deliberately left alone.
 */
export function WorkbenchRefineFacetTabs<TId extends string>({
  facets,
  activeId,
  onSelect,
  ariaLabel = 'Refine facets',
}: {
  /** `hot` marks a facet holding an active refinement. */
  facets: ReadonlyArray<{ id: TId; label: string; hot?: boolean }>;
  activeId: TId | null | undefined;
  onSelect: (id: TId) => void;
  ariaLabel?: string;
}) {
  if (facets.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-0.5 border-b border-border-default px-1"
    >
      {facets.map((facet) => {
        const selected = activeId === facet.id;
        return (
          <button
            key={facet.id}
            type="button"
            role="tab"
            aria-selected={selected}
            // Keep the popover open while switching facets — see the docblock.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(facet.id)}
            className={cn(
              // ds-raw-button: compact facet tabs inside WorkbenchFilterPopover.
              'ds-raw-button relative flex-1 border-b-2 px-1.5 py-1.5 text-role-caption font-medium transition-colors',
              selected
                ? 'border-blue-600 text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary',
            )}
          >
            {facet.label}
            {facet.hot ? (
              <span
                className="absolute right-0.5 top-1 h-1 w-1 rounded-full bg-blue-500"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Scroll port for the active facet's body, beneath {@link WorkbenchRefineFacetTabs}. */
export const WORKBENCH_REFINE_BODY_CLASS = 'max-h-64 overflow-y-auto py-0.5';

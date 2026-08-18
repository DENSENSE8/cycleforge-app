'use client';

/**
 * Left-dock park / restore controls — one glyph + size SoT.
 *
 * | Action   | Glyph              | Button | Icon class                          |
 * | Collapse | ArrowLeftToLine    | xs     | LEFT_DOCK_TOGGLE_ICON_CLASS         |
 * | Expand   | ArrowRightToLine   | xs     | same                                |
 *
 * Collapse seats in TechRailSearchBar age column — auto under
 * ContextPanelCollapseProvider, or explicit `trailingAction` (LedgerDrill).
 * Expand seats in {@link LeftDockCollapseStrip} — whole-strip click (or footer
 * chevron) restores the rail. Mid-strip: optional mini scan cell
 * ({@link CollapseStripScanCell}) then MRU pins ({@link CollapseStripMruPins}):
 * pin click selects (stay collapsed); double-click expands the rail.
 *
 * Public exports: {@link RailFilterCollapseButton}, {@link LeftDockCollapseStrip},
 * {@link CollapseStripMruPins}, {@link CollapseStripScanCell}. Expand button +
 * icon class stay module-private so size cannot fork.
 */

import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ArrowLeftToLine, ArrowRightToLine } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  CONTEXT_PANEL_COLLAPSE,
  CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
  CONTEXT_PANEL_COLLAPSE_STRIP_FOOTER_CLASS,
} from '@/components/sidebar/context-panel-column';
import type { CollapseStripPin } from '@/components/sidebar/context-panel-collapse-context';
import { contextPanelToggleHotkeyLabel } from '@/components/sidebar/context-panel-toggle-hotkey';
import { RailPopover } from '@/components/sidebar/rail-shell/RailPopover';
import { useRailHoverPreview } from '@/components/sidebar/rail-shell/useRailHoverPreview';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

function withContextPanelChord(base: string): string {
  return `${base} (${contextPanelToggleHotkeyLabel()})`;
}

export { CollapseStripScanCell } from '@/components/sidebar/tech/collapse-strip-scan-cell';

/** Shared glyph box for collapse + expand — never a bare `h-4` twin. */
const LEFT_DOCK_TOGGLE_ICON_CLASS = 'h-3.5 w-3.5';

const TOGGLE_BTN_CLASS = 'shrink-0 text-text-faint hover:text-text-default';

export function RailFilterCollapseButton({
  onCollapse,
  label = 'Hide sidebar',
  testId = 'rail-filter-collapse',
}: {
  onCollapse: () => void;
  label?: string;
  testId?: string;
}) {
  const face = withContextPanelChord(label);
  return (
    <HoverTooltip label={face} asChild>
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel={face}
        icon={<ArrowLeftToLine className={LEFT_DOCK_TOGGLE_ICON_CLASS} />}
        onClick={onCollapse}
        data-testid={testId}
        className={TOGGLE_BTN_CLASS}
      />
    </HoverTooltip>
  );
}

function LeftDockExpandButton({
  onExpand,
  label = 'Show sidebar',
  testId = 'left-dock-expand',
}: {
  onExpand: () => void;
  label?: string;
  testId?: string;
}) {
  const face = withContextPanelChord(label);
  return (
    <HoverTooltip label={face} asChild>
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel={face}
        icon={<ArrowRightToLine className={LEFT_DOCK_TOGGLE_ICON_CLASS} />}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onExpand();
        }}
        data-testid={testId}
        className={TOGGLE_BTN_CLASS}
      />
    </HoverTooltip>
  );
}

function collapsePinAriaLabel(pin: CollapseStripPin): string {
  return [pin.label, pin.meta, pin.statusLabel, pin.age].filter(Boolean).join(' · ');
}

/** Dense text tip when the feed has no `renderPopover` (e.g. Dashboard). */
function CollapseStripTextPeek({ pin }: { pin: CollapseStripPin }) {
  return (
    <span className="flex flex-col gap-0.5 text-left" data-collapse-strip-peek="">
      <span className="truncate font-semibold text-white">{pin.label}</span>
      {pin.meta ? (
        <span className="truncate text-role-micro font-medium text-white/80">
          {pin.meta}
        </span>
      ) : null}
      {pin.statusLabel || pin.age ? (
        <span className="truncate text-role-micro font-semibold uppercase tracking-widest text-white/65">
          {[
            pin.statusLabel,
            pin.age
              ? /\bago\b/i.test(pin.age)
                ? pin.age
                : `${pin.age} ago`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ) : null}
    </span>
  );
}

/**
 * One parked MRU pin. Prefer the open-rail {@link RailPopover} card
 * (`renderPeek` ← `renderPopover`) so copy chips match; otherwise a text tip.
 */
function CollapseStripPinFace({
  pin,
  onExpand,
}: {
  pin: CollapseStripPin;
  onExpand: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const hasRailPeek = Boolean(pin.renderPeek);
  const { isOpen: previewOpen, scheduleOpen, scheduleClose, dismiss } =
    useRailHoverPreview({ enabled: hasRailPeek });

  const pinClassName = cn(
    'shrink-0',
    pin.selected && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
  );

  const pinButton = (
    <IconButton
      ref={btnRef}
      size="xs"
      tone="neutral"
      ariaLabel={collapsePinAriaLabel(pin)}
      aria-current={pin.selected ? 'true' : undefined}
      data-collapse-strip-pin={String(pin.id)}
      data-selected={pin.selected ? 'true' : undefined}
      className={pinClassName}
      onClick={(e) => {
        e.stopPropagation();
        pin.onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
      onMouseEnter={hasRailPeek ? scheduleOpen : undefined}
      onMouseLeave={hasRailPeek ? scheduleClose : undefined}
      icon={
        <span
          aria-hidden
          className={cn('block h-2 w-2 rounded-full', pin.statusDotClass)}
        />
      }
    />
  );

  if (hasRailPeek) {
    return (
      <>
        {pinButton}
        {/* No AnimatePresence: the parked-pin peek reveals instantly, no exit. */}
        {previewOpen && pin.renderPeek ? (
          <RailPopover
            anchorEl={btnRef.current}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            onDismiss={dismiss}
          >
            <div data-collapse-strip-rail-peek="">
              {pin.renderPeek({
                openWorkspace: () => {
                  pin.onSelect();
                  dismiss();
                },
                dismiss,
              })}
            </div>
          </RailPopover>
        ) : null}
      </>
    );
  }

  return (
    <HoverTooltip label={<CollapseStripTextPeek pin={pin} />} asChild placement="below">
      {pinButton}
    </HoverTooltip>
  );
}

/**
 * Mid-strip MRU peek — top-N status dots from the open rail feed.
 * Click selects (keep collapsed); double-click expands the parked rail.
 * When the open rail has more than N rows, a +N control expands the sidebar.
 * Hover reuses the open-rail popover card when published (`renderPeek`);
 * otherwise a dense identity tip (title · meta · status · age).
 */
export function CollapseStripMruPins({
  pins,
  totalCount,
  onExpand,
}: {
  pins: CollapseStripPin[];
  /** Open-rail visible total — drives the +N overflow face. */
  totalCount: number;
  /** Double-click a pin / click +N restores the full sidebar (site-wide SoT). */
  onExpand: () => void;
}) {
  const capped = pins.slice(0, CONTEXT_PANEL_COLLAPSE.mruPinCount);
  const overflow = Math.max(0, totalCount - CONTEXT_PANEL_COLLAPSE.mruPinCount);
  if (capped.length === 0) return null;
  return (
    <nav
      aria-label="Recent items"
      className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-2"
      data-collapse-strip-mru=""
    >
      {capped.map((pin) => (
        <CollapseStripPinFace key={String(pin.id)} pin={pin} onExpand={onExpand} />
      ))}
      {overflow > 0 ? (
        <HoverTooltip label={`Show all · ${overflow} more`} asChild>
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel={`Show sidebar · ${overflow} more recent`}
            data-collapse-strip-overflow={String(overflow)}
            className="shrink-0 text-role-micro font-semibold tabular-nums text-text-soft"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            icon={<span aria-hidden>+{overflow}</span>}
          />
        </HoverTooltip>
      ) : null}
    </nav>
  );
}

/**
 * Parked left-dock strip — full-height age column with expand pinned to the
 * bottom filter-height footer (same seat as {@link RailFilterCollapseButton}).
 * Click / Enter / Space on the strip (empty mid or padding) restores the rail;
 * mid-strip {@link CollapseStripMruPins}: click selects, double-click expands.
 */
export function LeftDockCollapseStrip({
  onExpand,
  label = 'Show sidebar',
  testId = 'left-dock-expand',
  hostDataAttrs,
  children,
}: {
  onExpand: () => void;
  label?: string;
  testId?: string;
  /** Host identity hooks (e.g. `data-context-panel-collapsed`). */
  hostDataAttrs?: Record<string, string | boolean | undefined>;
  /**
   * Optional mid-strip content (usually {@link CollapseStripMruPins} with
   * `onExpand={onExpand}` so double-click expands).
   */
  children?: ReactNode;
}) {
  const face = withContextPanelChord(label);
  const onStripKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onExpand();
    }
  };

  return (
    <div
      className={cn(
        CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
        'min-h-0 cursor-pointer self-stretch',
      )}
      data-left-dock-collapsed=""
      role="button"
      tabIndex={0}
      aria-label={face}
      onClick={onExpand}
      onKeyDown={onStripKeyDown}
      {...hostDataAttrs}
    >
      <div
        className="flex min-h-0 flex-1 flex-col items-center"
        aria-hidden={children ? undefined : true}
      >
        {children}
      </div>
      <div
        className={CONTEXT_PANEL_COLLAPSE_STRIP_FOOTER_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <LeftDockExpandButton onExpand={onExpand} label={label} testId={testId} />
      </div>
    </div>
  );
}

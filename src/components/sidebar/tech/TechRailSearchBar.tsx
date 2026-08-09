'use client';

/**
 * Always-open compact filter — Search glyph + field + hover-reveal paste.
 *
 * **SoT for scoped list search** (rail footers AND workbench chrome). Replaces
 * the retired icon-first `ToolbarSearchToggle`.
 *
 * - `variant="rail"` (default) — bottom-anchored band for MasterNav / station
 *   rails (Testing / Shipping / Unbox / Packer / Triage) and LedgerDrill
 *   parent-map footers. Owns {@link STATION_COLUMN_FOOTER_BAND_FACE} (`h-8` +
 *   floor hairline) + card surface + density padding — same Y as Displays
 *   `→|` / utility `←|` / Unbox dock Band 2 / spine sign-in. Pins
 *   `--cf-density: 1` so spreadsheet zoom on a wrapping grid host cannot
 *   shrink the band below sibling footers.
 * - `variant="chrome"` — workbench header / triage band. Same in-field Search
 *   glyph as rail (`SearchBar` → `SearchField`); flush sunken plane (no rounded
 *   bubble) hosts the field + optional `trailingAction`, edge-to-edge with the
 *   triage row. No rail band.
 *
 * **Trailing icon grammar (rail footers):**
 * 1. Empty-field **paste** — hover-reveal only (`SearchField` + `group/search-bar`)
 * 2. In-field **filters** — `trailingSuffix` (after paste; paste leads the cluster)
 * 3. Age-column **collapse** — auto from {@link useContextPanelCollapse} when
 *    mounted under `ContextPanelCollapseProvider`; override via `trailingAction`
 *    (LedgerDrill parent map, Incoming list-paste, etc.)
 * All three use a 24px control / 14px glyph box and one centered row.
 *
 * Not the global header search (the app's only "search the app" surface).
 */

import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { Search } from '@/components/Icons';
import {
  SIDEBAR_RAIL_TRAILING_TRACK_CLASS,
  STATION_COLUMN_FOOTER_BAND_FACE,
} from '@/components/layout/header-shell';
import { useContextPanelCollapse } from '@/components/sidebar/context-panel-collapse-context';
import { RailFilterCollapseButton } from '@/components/sidebar/tech/left-dock-toggle';
import { SearchBar } from '@/components/ui/SearchBar';
import { cn } from '@/utils/_cn';

/** Keys that drive a sibling result list from the box — flush draft first. */
const FILTER_NAV_KEYS = new Set([
  'Enter',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Escape',
]);

export function TechRailSearchBar({
  value,
  onChange,
  onClear,
  onKeyDown,
  placeholder = 'Filter lines…',
  density = 'row',
  variant = 'rail',
  isSearching = false,
  trailingPrefix,
  trailingSuffix,
  trailingAction,
  inputRef,
  navKeyHint,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Extra clear side-effects (URL wipe, etc.). Draft clear + `onChange('')`
   * always run; this fires after.
   */
  onClear?: () => void;
  /**
   * Keydown from the field, caught on the wrapper (the event bubbles). Lets a
   * host drive a result list from the box — ↓/↑/Enter in the MasterNav spine
   * and Station Displays Root Index (`Filter displays…`). Optional: station
   * recent rails filter a list that is already reachable by pointer and pass
   * nothing.
   *
   * Before the host handler runs, navigational keys flush the local draft via
   * `flushSync` so Enter commits against what the operator typed, not the
   * 250ms-debounced parent value.
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  placeholder?: string;
  /**
   * The band's vertical rhythm — **the component owns its whole padding story**,
   * so a host never stacks a raw `p-*` on the `inset-field` intent (both survive
   * `cn()` and the intent wins in CSS order, so the override silently no-ops).
   *
   * - `row` (default) — horizontal `px-3` only so the band measures one nav row
   *   (~33px). Shared by MasterNav spine and station recent rails.
   * - `default` — escape hatch: `inset-field` + the 32px field = 49px dock.
   *
   * Ignored when `variant="chrome"`.
   */
  density?: 'default' | 'row';
  /**
   * - `rail` (default) — bordered band for MasterNav / station footers.
   * - `chrome` — workbench / triage: flush sunken field with in-field Search
   *   (no rounded bubble — sits edge-to-edge in the triage band).
   */
  variant?: 'rail' | 'chrome';
  /**
   * Spins the SearchField trailing loader while a query fetch is in flight.
   * Empty field never shows a spinner — SearchField gates on non-empty value.
   * Ignored when `variant="chrome"` — triage / header search keeps clear /
   * paste on the trailing edge (no fetch spinner).
   */
  isSearching?: boolean;
  /**
   * In-field actions **left of** paste/clear — non-filter CTAs that must lead
   * the trailing cluster (e.g. Ecwid “Product not added yet?”). Field-density
   * {@link WorkbenchFilterPopover} filters use {@link trailingSuffix} instead
   * so hover-reveal paste stays leftmost.
   */
  trailingPrefix?: ReactNode;
  /**
   * In-field actions **after** paste/clear — field-density filters (Unbox rail
   * facets, `/search` refine, Ecwid order scope). Paste leads; filter follows.
   */
  trailingSuffix?: ReactNode;
  /**
   * Sibling control in the rail **age column** (`SIDEBAR_RAIL_TRAILING_TRACK_CLASS`)
   * — same vertical track as row relative-time (`11h`) and the parked expand
   * strip. When omitted on `variant="rail"` inside a context panel, defaults to
   * {@link RailFilterCollapseButton}. Pass explicitly for LedgerDrill parent-map
   * collapse, Incoming list-paste, or to suppress (`null`).
   */
  trailingAction?: ReactNode;
  /**
   * Focus handle for the field. Lets a host aim a keyboard chord at THIS bar
   * (nav-keys `⌘;` → region → letter) without querying the DOM for an input.
   */
  inputRef?: React.Ref<HTMLInputElement>;
  /**
   * Reveal-on-arm keycap (nav-keys). Renders as the LAST in-field trailing item
   * — after paste and after {@link trailingSuffix} filters — and only while the
   * host's region is armed. Never a resident affordance: nav keys reveal on arm
   * and vanish on disarm, so this is `undefined` at rest.
   */
  navKeyHint?: ReactNode;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (draft.trim() !== value.trim()) onChange(draft);
    }, 250);
    return () => clearTimeout(id);
  }, [draft, value, onChange]);

  const clear = () => {
    setDraft('');
    onChange('');
    onClear?.();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      onKeyDown &&
      FILTER_NAV_KEYS.has(e.key) &&
      draft.trim() !== value.trim()
    ) {
      flushSync(() => {
        onChange(draft);
      });
    }
    onKeyDown?.(e);
  };

  const chrome = variant === 'chrome';
  const contextPanelCollapse = useContextPanelCollapse();

  // Rail footers under ContextPanelCollapseProvider inherit collapse — every
  // recent rail (Unbox · Triage · Testing · Shipping · Packer · …) shares one
  // grammar without each host re-wiring RailFilterCollapseButton. Explicit
  // trailingAction wins (LedgerDrill, Incoming paste, chrome hosts).
  const resolvedTrailingAction =
    trailingAction !== undefined
      ? trailingAction
      : !chrome && contextPanelCollapse
        ? (
            <RailFilterCollapseButton
              onCollapse={contextPanelCollapse.collapse}
              label="Hide sidebar"
            />
          )
        : null;

  const field = (
    <SearchBar
      value={draft}
      onChange={setDraft}
      onClear={clear}
      placeholder={placeholder}
      size="compact"
      isSearching={chrome ? false : isSearching}
      leadingIcon={<Search className="h-3.5 w-3.5" />}
      hideUnderline
      trailingPrefix={trailingPrefix}
      trailingSuffix={
        navKeyHint ? (
          <>
            {trailingSuffix}
            {navKeyHint}
          </>
        ) : (
          trailingSuffix
        )
      }
      inputRef={inputRef}
    />
  );

  return (
    <div
      onKeyDown={handleKeyDown}
      // `group/search-bar` — empty-field paste reveals only while THIS host is
      // hovered/focused, not while the pointer is on a list above.
      //
      // Rail bands sit beside context-rail footers (Unboxed / Triage / …) that
      // never inherit spreadsheet `--cf-density` zoom. When this bar is
      // composed inside a zoomed LedgerGrid host (History drill parent map),
      // pin density to 1 so both bottom bars share one nav-row height.
      style={chrome ? undefined : ({ '--cf-density': '1' } as CSSProperties)}
      className={cn(
        'group/search-bar shrink-0',
        chrome
          ? // Stretch to the triage / chrome-band cross-axis so the sunken
            // plane is edge-to-edge with the row (not a floated pill).
            'flex h-full min-w-0 self-stretch items-stretch'
          : [
              STATION_COLUMN_FOOTER_BAND_FACE,
              'bg-surface-card',
              // With a trailing collapse, flush right so the age / collapse
              // column lines up with full-bleed rail rows; otherwise keep the
              // denser bilateral `px-3`.
              resolvedTrailingAction
                ? 'py-0 pl-3 pr-0'
                : density === 'row'
                  ? 'px-3'
                  : 'inset-field',
            ],
        className,
      )}
    >
      {chrome ? (
        <div className="flex h-full min-w-0 flex-1 items-center gap-0.5 bg-surface-sunken px-2">
          <div className="min-w-0 flex-1">{field}</div>
          {resolvedTrailingAction}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">{field}</div>
          {resolvedTrailingAction ? (
            <div className={cn('-ml-1 h-full', SIDEBAR_RAIL_TRAILING_TRACK_CLASS)}>
              {resolvedTrailingAction}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

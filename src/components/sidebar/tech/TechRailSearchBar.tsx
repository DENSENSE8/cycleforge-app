'use client';

/**
 * Always-open compact filter — Search glyph + field + paste.
 *
 * **SoT for scoped list search** (rail footers AND workbench chrome). Replaces
 * the retired icon-first `ToolbarSearchToggle`.
 *
 * - `variant="rail"` (default) — bottom-anchored band for MasterNav / station
 *   rails (Testing / Shipping / Unbox / Packer / Triage) and LedgerDrill
 *   parent-map footers. Owns {@link STATION_COLUMN_FOOTER_BAND_FACE} (`h-7` +
 *   floor hairline) + card surface + density padding — same Y as Displays
 *   `→|` / utility `←|` / Unbox dock Band 2 / spine sign-in / To ship tabs.
 *   Pins `--cf-density: 1` so spreadsheet zoom on a wrapping grid host cannot
 *   shrink the band below sibling footers.
 * - `variant="chrome"` — workbench header / triage band. Same in-field Search
 *   glyph as rail (`SearchBar` → `SearchField`); flush sunken plane (no rounded
 *   bubble) hosts the field + optional `trailingAction`, edge-to-edge with the
 *   triage row. No rail band. **Paste is persistent here** (`pasteVisibility`
 *   `always`): Band 3 is the row an operator arrives at holding a tracking
 *   number, so the clipboard glyph keeps a fixed opaque slot instead of
 *   appearing only once the pointer is already on the field. Rails stay
 *   hover-reveal — a rail footer sits under a list the pointer crosses on the
 *   way to something else, and a lit glyph there is noise.
 *
 * **Trailing icon grammar (rail footers):**
 * 1. Empty-field **paste** — hover-reveal only (`SearchField` + `group/search-bar`)
 * 2. In-field **filters** — usually `trailingSuffix` (after paste). Packed puts
 *    exact staff / date chips + the funnel in `trailingPrefix` (left of paste) —
 *    same left-of-paste grammar as the sheet week pill.
 * 3. Age-column **collapse** — auto from {@link useContextPanelCollapse} when
 *    mounted under `ContextPanelCollapseProvider`; override via `trailingAction`
 *    (LedgerDrill parent map, Incoming list-paste, etc.)
 * All three use a 24px control / 14px glyph box and one centered row.
 *
 * Not the global header search (the app's only "search the app" surface).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
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
import { useFindFieldScan } from '@/hooks/useFindFieldScan';
import type { ScanRoute } from '@/lib/barcode-routing';
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
  onSearch,
  onClear,
  onKeyDown,
  placeholder = 'Filter lines…',
  density = 'row',
  variant = 'rail',
  isSearching = false,
  trailingPrefix,
  trailingSuffix,
  inlineContent,
  inlineContentKey,
  pasteVisibility,
  trailingAction,
  inputRef,
  onScanHandle,
  navKeyHint,
  flush = false,
  className,
  'data-testid': dataTestId,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Extra clear side-effects (URL wipe, etc.). Draft clear + `onChange('')`
   * always run; this fires after.
   */
  /**
   * COMMIT — Enter, or a paste into an empty field (paste is a commit, not a
   * draft fill; `SearchField` owns that rule). A find bar whose query is
   * submitted rather than filtered-as-you-type needs this: Labels History
   * scans a DataMatrix and hands it off. Without it that surface forked a raw
   * `SearchField` into the band and inherited none of the bar's chrome.
   */
  onSearch?: (value: string) => void;
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
   * - `row` (default) — horizontal `px-3` only so the band measures one ops
   *   chrome row ({@link PRIMARY_CHROME_ROW_FACE} / 28px). Shared by station
   *   recent rails (MasterNav find uses `variant="chrome"` instead).
   * - `default` — escape hatch: `inset-field` + the 28px field = taller dock.
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
   * In-field actions **left of** paste/clear — Packed filter funnel, Ecwid
   * “Product not added yet?”, etc. Field-density peers of paste.
   */
  trailingPrefix?: ReactNode;
  /**
   * Full-height status in the trailing cluster (Packed staff / exact date).
   * Collapses to the funnel hot-dot when the field cannot fit the label.
   */
  inlineContent?: ReactNode;
  /** Stable key so the field re-measures when the in-field label changes. */
  inlineContentKey?: string;
  /**
   * In-field actions **after** paste/clear — field-density filters (Unbox rail
   * facets, `/search` refine, Ecwid order scope). Paste leads; filter follows.
   * Packed prefers {@link trailingPrefix} so the funnel sits left of paste.
   */
  trailingSuffix?: ReactNode;
  /**
   * Paste affordance visibility. Defaults by variant — `chrome` bands hold the
   * clipboard glyph in a fixed opaque slot, rails keep it hover-reveal — so a
   * host inherits the right one by saying nothing. Name it only to opt a
   * specific chrome host OUT (`'hover'`); that is one word, and one word is
   * what stops the next quiet host from forking the bar to get its old face.
   */
  pasteVisibility?: 'hover' | 'always';
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
   * OPT-IN: a printed handle scanned INTO this field.
   *
   * The global wedge listener bails on editable focus (a field the operator is
   * typing into owns its keys), so without this a gun fired with the cursor in
   * the box types literal characters and no decoder ever runs — the reason ~30
   * find fields decode nothing today.
   *
   * Only a machine-fast burst that decodes to one of OUR labels arrives here; a
   * human typing the same characters never can, and a carrier tracking number
   * stays a text query (`routeScan` has no carrier vocabulary — that arm is the
   * server's). Return `false` to keep the value in the field.
   *
   * Opt-in per surface: a field with nowhere to send a handle must not pretend
   * it can accept one.
   */
  onScanHandle?: (route: ScanRoute, raw: string) => boolean | void;
  /**
   * Reveal-on-arm keycap (nav-keys). Renders as the LAST in-field trailing item
   * — after paste and after {@link trailingSuffix} filters — and only while the
   * host's region is armed. Never a resident affordance: nav keys reveal on arm
   * and vanish on disarm, so this is `undefined` at rest.
   */
  navKeyHint?: ReactNode;
  /**
   * `variant="chrome"` only. Zero horizontal pad / gap on the sunken plane so
   * a host band (MasterNav find) can sit the field flush to the chrome edges.
   */
  flush?: boolean;
  className?: string;
  /** Host-owned hook for E2E — the band wrapper carries it. */
  'data-testid'?: string;
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
  const chromeFlush = chrome && flush;
  /**
   * The field's own node, merged with any caller ref, so the opt-in scan
   * listener can bind natively without taking the ref away from the host.
   */
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      localInputRef.current = node;
      const forwarded = inputRef as Ref<HTMLInputElement> | undefined;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded && typeof forwarded === 'object') {
        (forwarded as { current: HTMLInputElement | null }).current = node;
      }
    },
    [inputRef],
  );
  useFindFieldScan(localInputRef, {
    onHandle: (route, raw) => onScanHandle?.(route, raw),
    enabled: Boolean(onScanHandle),
  });

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
      onSearch={onSearch}
      onClear={clear}
      placeholder={placeholder}
        size="compact"
        isSearching={chrome ? false : isSearching}
        leadingIcon={<Search className="h-3.5 w-3.5" />}
        hideUnderline
        fillHost={chrome}
        pasteVisibility={pasteVisibility ?? (chrome ? 'always' : 'hover')}
      trailingPrefix={trailingPrefix}
      inlineContent={inlineContent}
      inlineContentKey={inlineContentKey}
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
      inputRef={setInputRef}
    />
  );

  return (
    <div
      onKeyDown={handleKeyDown}
      data-testid={dataTestId}
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
        <div
          className={cn(
            'flex h-full min-w-0 flex-1 items-center bg-surface-sunken',
            // Leading pad only when not flush — trailing edge abuts Views /
            // table controls on Band 3 (`WorkbenchTriageBand` gap-0). Bilateral
            // `px-2` left a soft gray pad that read as air before the cluster.
            chromeFlush ? 'gap-0 px-0' : 'gap-0.5 pl-2 pr-0',
          )}
        >          <div className="h-full min-w-0 flex-1">{field}</div>
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

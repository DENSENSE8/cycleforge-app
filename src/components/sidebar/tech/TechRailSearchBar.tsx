'use client';

/**
 * Always-open compact filter — Search glyph + field + hover-reveal paste.
 *
 * **SoT for scoped list search** (rail footers AND workbench chrome). Replaces
 * the retired icon-first `ToolbarSearchToggle`.
 *
 * - `variant="rail"` (default) — bottom-anchored band for MasterNav / station
 *   rails (Testing / Shipping / Unbox / Packer / Triage) and LedgerDrill
 *   parent-map footers. Owns `border-t` + card surface + density padding.
 *   Pins `--cf-density: 1` so spreadsheet zoom on a wrapping grid host cannot
 *   shrink the band below the sibling context-rail footer height.
 * - `variant="chrome"` — workbench header / triage band. Same in-field Search
 *   glyph as rail (`SearchBar` → `SearchField`); flush sunken plane (no rounded
 *   bubble) hosts the field + optional `trailingAction`, edge-to-edge with the
 *   triage row. No rail band.
 *
 * Not the global header search (the app's only "search the app" surface).
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Search } from '@/components/Icons';
import {
  SIDEBAR_RAIL_ROW_PAD_RIGHT,
  SIDEBAR_RAIL_TRAILING_TRACK_CLASS,
} from '@/components/layout/header-shell';
import { SearchBar } from '@/components/ui/SearchBar';
import { cn } from '@/utils/_cn';

export function TechRailSearchBar({
  value,
  onChange,
  onClear,
  onKeyDown,
  placeholder = 'Filter lines…',
  density = 'row',
  variant = 'rail',
  isSearching = false,
  trailingAction,
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
   * host drive a result list from the box — ↓/↑/Enter in the MasterNav spine.
   * Optional: station rails filter a list that is already reachable by pointer
   * and pass nothing.
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
   * Sibling control in the rail **age column** (`SIDEBAR_RAIL_TRAILING_TRACK_CLASS`)
   * — same vertical track as row relative-time (`11h`) and the parked expand
   * strip. Incoming paste also seats here. Keep to ONE icon-only control with
   * a `HoverTooltip`.
   */
  trailingAction?: ReactNode;
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

  const chrome = variant === 'chrome';

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
    />
  );

  return (
    <div
      onKeyDown={onKeyDown}
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
              'border-t border-border-hairline bg-surface-card',
              // With a trailing collapse, match rail row right pad so the age
              // column lines up; otherwise keep the denser bilateral `px-3`.
              trailingAction
                ? cn('py-0 pl-3', SIDEBAR_RAIL_ROW_PAD_RIGHT)
                : density === 'row'
                  ? 'px-3'
                  : 'inset-field',
            ],
        className,
      )}
    >
      {chrome ? (
        <div className="flex h-full min-w-0 flex-1 items-center gap-1 bg-surface-sunken px-2">
          <div className="min-w-0 flex-1">{field}</div>
          {trailingAction}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">{field}</div>
          {trailingAction ? (
            <div className={SIDEBAR_RAIL_TRAILING_TRACK_CLASS}>{trailingAction}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * THE ONE INPUT. Leftmost thing in the application, because scan is the
 * origin: everything an operator does at a bench starts with a barcode.
 *
 * The 2x2 mode matrix is two axes, not a four-way switch, and the heavier rule
 * between them says so:
 *
 *   input axis   auto | key   — does my TYPING count as a scan? `auto` = wedge
 *                              only (typing searches); `key` = hand-enter a
 *                              damaged barcode into the session. That is the
 *                              only genuine mode here — a wedge burst and human
 *                              typing are different input paths and both work
 *                              at once, so scan-vs-search is not a mode.
 *   query axis   find | flt   — what a query does: search the org, or filter
 *                              the focused tile.
 *
 * Mode errors are prevented by naming the DESTINATION, not by asking the
 * operator to remember which mode they are in: the placeholder always says
 * where this field's contents are going.
 */

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRef } from 'react';
import { Icon } from '@/shell/icons';
import type { ScanMode } from '@/shell/model';

function placeholderFor(mode: ScanMode): string {
  if (mode.input === 'manual') return 'SCAN · TYPING COUNTS AS A SCAN';
  if (mode.action === 'filter') return 'SCAN · OR TYPE TO FILTER THIS TILE';
  return 'SCAN · OR TYPE TO SEARCH';
}

export function ScanBar({
  mode,
  onModeChange,
  onSearch,
}: {
  mode: ScanMode;
  onModeChange: (next: ScanMode) => void;
  /** Typing opens the launcher in place. The session is NOT parked. */
  onSearch: (query: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="zone-scan">
      <Icon name="scan" size={14} />
      <div className="scan-input-wrap">
        <input
          ref={input}
          type="text"
          autoComplete="off"
          aria-label="Scan or search"
          placeholder={placeholderFor(mode)}
          onChange={(e) => {
            const value = e.target.value;
            // A wedge burst and human typing are different input paths, so the
            // arm never drops for a lookup — no mode switch, no park.
            if (mode.input === 'manual' || mode.action === 'filter') return;
            if (value.length >= 2) {
              onSearch(value);
              e.target.value = '';
            }
          }}
        />
      </div>
      {/* Two axes, one strip — input mode | query mode. The heavier
          divider before `find` is what stops it reading as one four-way
          switch (it was a `border-left: 3px` rule named `.axis-gap`). */}
      <ToggleGroup aria-label="Typing: auto = searches · key = counts as a scan | find = search org · flt = filter focused tile">
        <ToggleGroupItem active={mode.input === 'auto'} onClick={() => onModeChange({ ...mode, input: 'auto' })}>
          auto
        </ToggleGroupItem>
        <ToggleGroupItem active={mode.input === 'manual'} onClick={() => onModeChange({ ...mode, input: 'manual' })}>
          key
        </ToggleGroupItem>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <ToggleGroupItem active={mode.action === 'search'} onClick={() => onModeChange({ ...mode, action: 'search' })}>
          find
        </ToggleGroupItem>
        <ToggleGroupItem active={mode.action === 'filter'} onClick={() => onModeChange({ ...mode, action: 'filter' })}>
          flt
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

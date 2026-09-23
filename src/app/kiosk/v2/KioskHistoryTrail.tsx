'use client';

/**
 * History's trail controls — the search glyph and the kind filter, seated in
 * the shell's ONE header band beside the command dropdown.
 *
 * Callers: `KioskHistoryPane`, through the `chrome` slot `KioskShell` hands
 * it. Affected API: none (the pane owns the query hook). Schemas:
 * `KioskVisitKindFilter`.
 * User 2026-09-22: *"the search bar functions like filter and search icon the
 * same as the repair service mode … remove the top left history text its
 * already in the drop down … switch the tabs below the search bar to just a
 * filter after the search icon."*
 *
 * This IS the catalog trail's bracket (`ProductSelector` kiosk-split), not a
 * second one:
 *
 * - **One search glyph**, and it both opens and closes (`aria-pressed`).
 *   `hideLeadingIcon` silences `SearchField`'s own magnifier so the row never
 *   grows a second one, and closing clears the query — a live query behind a
 *   closed field is a filtered rail whose reason the operator cannot see.
 * - **One filter, a word chip** on `KIOSK_POS_TRAIL_CONTROL` — the same
 *   control the catalog's category dropdown is, in the slot right after the
 *   glyph. It replaced an All/Sales/Repair `TabSwitch` under a second search
 *   box in the left rail: two find-bars, two vocabularies, one band too many.
 *
 * The rail below now owns rows and nothing else.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { Search } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { SearchField } from '@/design-system/primitives/SearchField';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import {
  KIOSK_POS_TRAIL_CONTROL,
  KIOSK_POS_TRAIL_ICON,
} from '@/app/kiosk/kiosk-pos-surface';
import type { KioskVisitKindFilter } from '@/lib/kiosk/history/kiosk-history-client';
import { cn } from '@/utils/_cn';

/**
 * All · Sales · Repair service — the counter's three answers to "which paper
 * am I looking for". A visit that produced `repair_service` rows is a repair,
 * one that did not is a sale, and a mixed visit answers to both (see
 * `list-kiosk-visits`).
 */
const KIND_OPTIONS: readonly { value: KioskVisitKindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sales', label: 'Sales' },
  { value: 'repair', label: 'Repair service' },
];

export function KioskHistoryTrail({
  search,
  onSearchChange,
  kind,
  onKindChange,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  kind: KioskVisitKindFilter;
  onKindChange: (next: KioskVisitKindFilter) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchHostRef = useRef<HTMLDivElement | null>(null);

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchHostRef.current?.querySelector('input')?.focus();
    });
  };

  /** Closing is also a clear — see the docblock. */
  const closeSearch = () => {
    setSearchOpen(false);
    onSearchChange('');
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <IconButton
        icon={<Search className={TOP_CHROME_ICON_FACE} />}
        ariaLabel="Search visits"
        aria-pressed={searchOpen}
        size="md"
        onClick={searchOpen ? closeSearch : openSearch}
        className={cn(
          HEADER_ICON_BTN_CLASS,
          KIOSK_POS_TRAIL_ICON,
          searchOpen && HEADER_ICON_BTN_OPEN_CLASS,
        )}
        data-testid="kiosk-history-search-toggle"
      />
      {searchOpen ? (
        <div
          ref={searchHostRef}
          className="flex min-w-0 flex-1 items-center"
          data-testid="kiosk-history-search"
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Escape') closeSearch();
          }}
        >
          <SearchField
            fillHost
            hideUnderline
            hideLeadingIcon
            placeholder="Phone, ticket # or last 4"
            value={search}
            onChange={onSearchChange}
            className="min-w-0 flex-1"
          />
        </div>
      ) : null}
      <IntakeCombobox
        testId="kiosk-history-filter"
        ariaLabel="Filter visits"
        triggerVariant="ghost"
        value={kind}
        placeholder="All"
        searchPlaceholder="Search filters"
        emptyMessage="No filters match"
        className={cn(
          KIOSK_POS_TRAIL_CONTROL,
          'shrink-0 font-medium text-text-default',
          focusRing('control', 'neutral'),
        )}
        contentClassName={cn('min-w-56 overflow-hidden', DROPDOWN_SHELL_CORNER)}
        optionTestId={(opt) => `kiosk-history-filter-${opt.value}`}
        options={KIND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        onChange={(next) => onKindChange(next as KioskVisitKindFilter)}
      />
    </div>
  );
}

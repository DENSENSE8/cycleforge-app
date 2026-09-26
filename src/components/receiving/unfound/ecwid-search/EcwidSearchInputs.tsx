import { useEffect, useRef } from 'react';
import { SearchBar } from '@/components/ui/SearchBar';
import { SearchField } from '@/design-system/primitives/SearchField';
import { StationDisplaySearchHeader } from '@/components/station/displays/StationDisplaySearchHeader';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import {
  EcwidOrderScopeHotChip,
} from './EcwidOrderScopeFilters';
import type { EcwidProductSearchController } from './useEcwidProductSearch';

/** The search-input area — one of four branches keyed on mode + manual flags. */
export function EcwidSearchInputs({
  c,
  autoFocusSearch = true,
  /** When true (Package Pairing bare chrome), skip nested card inset pad. */
  flush = false,
}: {
  c: EcwidProductSearchController;
  autoFocusSearch?: boolean;
  flush?: boolean;
}) {
  const { popoverMode, manualTitleMode } = c;
  // Flush = Displays leaf. `pt-0` gave these branches NO inset at all, so they
  // jammed to the column edge; `inset-field` is the same 8/12 rule the result
  // rows and {@link StationDisplaySearchHeader} use.
  const pad = flush ? 'inset-field' : 'px-2 pt-1';

  // TechRailSearchBar has no `autoFocus` prop (it is a rail/chrome footer
  // SoT, not a form field) — focus it imperatively via `inputRef` instead,
  // same effect the old `autoFocus={autoFocusSearch}` had on the raw SearchBar.
  const repairSearchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (popoverMode === 'repair_service' && autoFocusSearch) {
      repairSearchInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus-once on mode entry, not every keystroke
  }, [popoverMode]);

  const notAddedYet = (
    <HoverTooltip label="Product not added yet?" asChild>
      <button
        type="button"
        onClick={() => {
          c.setManualTitleMode(true);
          c.setManualTitle('');
          c.setQuery('');
          c.setItems([]);
          c.setError(null);
          c.abortRef.current?.abort();
          c.setIsLoading(false);
        }}
        aria-label="Product not added yet?"
        className="ds-raw-button max-w-[9.5rem] shrink truncate rounded-md border border-blue-200 bg-blue-50/80 inset-chip text-left text-role-micro font-semibold leading-tight text-blue-800 hover:bg-blue-100 sm:max-w-[12rem]"
      >
        Product not added yet?
      </button>
    </HoverTooltip>
  );

  if (popoverMode === 'search' && !manualTitleMode) {
    // `flush` IS the Displays leaf.
    return flush ? (
      <StationDisplaySearchHeader
        value={c.query}
        onChange={c.setQuery}
        placeholder={c.placeholder}
        isSearching={c.isLoading}
        autoFocus={autoFocusSearch}
        rightElement={notAddedYet}
      />
    ) : (
      <div className={pad}>
        <SearchBar
          value={c.query}
          onChange={c.setQuery}
          placeholder={c.placeholder}
          autoFocus={autoFocusSearch}
          isSearching={c.isLoading}
          variant="blue"
          size="compact"
          hideUnderline
          rightElement={notAddedYet}
        />
      </div>
    );
  }

  if (popoverMode === 'search' && manualTitleMode) {
    return (
      <div className={`space-y-2 ${pad}`}>
        <SearchBar
          value={c.manualTitle}
          onChange={c.setManualTitle}
          placeholder="Enter Product Title to add"
          autoFocus={autoFocusSearch}
          variant="blue"
          size="compact"
          hideUnderline
          onSearch={(v) => {
            if (v.trim()) void c.handleManualTitleSubmit();
          }}
        />
        <Button
          variant="primary"
          type="button"
          disabled={
            c.manualSubmitting || c.submittingId != null || !c.manualTitle.trim()
          }
          onClick={() => void c.handleManualTitleSubmit()}
          className="w-full disabled:bg-surface-strong disabled:opacity-100"
        >
          {c.manualSubmitting ? 'Adding…' : 'Add to carton'}
        </Button>
      </div>
    );
  }

  if (popoverMode === 'repair_service') {
    // Flush = Displays leaf:
    return flush ? (
      <StationDisplaySearchHeader
        value={c.repairFilter}
        onChange={c.setRepairFilter}
        placeholder="Filter by order #, title, or SKU…"
        inputRef={repairSearchInputRef}
        trailing={<EcwidOrderScopeHotChip c={c} />}
      />
    ) : (
      <div className={`flex items-center gap-1.5 ${pad}`}>
        {/* Same SoT search bar as every rail footer AND workbench chrome header (TechRailSearchBar — "Filter queue…" on Unbox, "Filter lines…" on… */}
        <SearchField
          value={c.repairFilter}
          onChange={c.setRepairFilter}
          placeholder="Filter by order #, title, or SKU…"
          inputRef={repairSearchInputRef}
        />
        <EcwidOrderScopeHotChip c={c} />
      </div>
    );
  }

  return (
    <p className={`${flush ? 'pt-0' : 'px-3 pt-1'} text-role-micro text-text-soft`}>
      Pick an order containing a repair-service SKU to link this carton.
    </p>
  );
}

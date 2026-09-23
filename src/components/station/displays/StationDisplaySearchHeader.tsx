'use client';

/**
 * The ONE search header for a Displays leaf.
 *
 * A leaf that searches has the same two parts everywhere: a field pinned at the
 * top and a result list that scrolls under it. Each leaf used to spell that
 * itself, and they disagreed — `PoLinkTab` and the Store avenue
 * (`EcwidSearchInputs` in `flush` mode) both passed `hideUnderline`, which
 * strips the field's own chrome, and then added no inset of their own. The bar
 * sat flush on the column edge (icon at the panel's x) while every result row
 * below it is inset, so the text column visibly stepped, and with no vertical
 * padding the field had no air above or below it.
 *
 * The inset is `inset-field` — the SAME intent the pairing candidate rows use —
 * not {@link DISPLAYS_BODY_INSET} (`px-4`). A search header aligns with the list
 * it heads, and this list's rows are `inset-field`. Two gutters in one column is
 * the defect, whichever token is "more canonical".
 *
 * The bottom hairline is the same seam the flush rows use, so the field reads as
 * the list's header rather than a control floating above it.
 *
 * Callers: `PoLinkTab` (order pairing), `EcwidSearchInputs` (Store avenue).
 * Operator (2026-09-23): *"the search bar must be the same component … into all
 * the different search bar components within the display in general"*.
 */

import type { ReactNode, Ref } from 'react';
import { SearchBar } from '@/components/ui/SearchBar';
import { cn } from '@/utils/_cn';

export function StationDisplaySearchHeader({
  value,
  onChange,
  placeholder,
  isSearching = false,
  autoFocus = false,
  inputRef,
  onSearch,
  debounceMs,
  rightElement,
  /** Trailing control OUTSIDE the field (scope chip, filter pill). */
  trailing,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  isSearching?: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onSearch?: (value: string) => void;
  debounceMs?: number;
  rightElement?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-b border-border-hairline inset-field',
        trailing && 'flex items-center gap-1.5',
        className,
      )}
    >
      <SearchBar
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        isSearching={isSearching}
        variant="blue"
        size="compact"
        hideUnderline
        autoFocus={autoFocus}
        inputRef={inputRef}
        onSearch={onSearch}
        debounceMs={debounceMs}
        rightElement={rightElement}
        className={trailing ? 'min-w-0 flex-1' : undefined}
      />
      {trailing}
    </div>
  );
}

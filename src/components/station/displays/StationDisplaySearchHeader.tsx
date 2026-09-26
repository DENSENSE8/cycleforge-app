'use client';

/**
 * The ONE search header for a Displays leaf.
 * Operator (2026-09-23): *"the search bar must be the same component … into all
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

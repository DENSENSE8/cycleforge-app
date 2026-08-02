'use client';

/**
 * Bottom-anchored client-side filter band. Station rails (Testing / Shipping /
 * Unbox) pin it below the scrollable carton list; MasterNav spine pins the
 * same component above Settings/Admin to filter root sections or the open
 * drill's pages. Compact station-style filter — not the global header search
 * (which is the only "search the app" surface).
 */

import { useEffect, useState } from 'react';
import { Search } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { cn } from '@/utils/_cn';

export function TechRailSearchBar({
  value,
  onChange,
  onKeyDown,
  placeholder = 'Filter lines…',
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Keydown from the field, caught on the wrapper (the event bubbles). Lets a
   * host drive a result list from the box — ↓/↑/Enter in the MasterNav spine.
   * Optional: station rails filter a list that is already reachable by pointer
   * and pass nothing.
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  placeholder?: string;
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

  return (
    <div
      onKeyDown={onKeyDown}
      className={cn(
        'shrink-0 border-t border-border-hairline bg-surface-card inset-field',
        className,
      )}
    >
      <SearchBar
        value={draft}
        onChange={setDraft}
        onClear={() => {
          setDraft('');
          onChange('');
        }}
        placeholder={placeholder}
        size="compact"
        leadingIcon={<Search className="h-3.5 w-3.5" />}
        hideUnderline
      />
    </div>
  );
}

'use client';

/**
 * Bottom-anchored client-side filter band. Station rails (Testing / Shipping /
 * Unbox) pin it below the scrollable carton list; MasterNav spine pins the
 * same component above Settings/Admin to filter root sections or the open
 * drill's pages. Compact station-style filter — not the global header search
 * (which is the only "search the app" surface).
 *
 * Two hosts, two vertical rhythms, ONE component: `density` is the whole story
 * (see the prop). The spine's band has to read as one more row in a list of
 * rows; a station rail's band is a dock under a scrollable carton list and keeps
 * the taller `inset-field` inset.
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
  density = 'default',
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
  /**
   * The band's vertical rhythm — **the component owns its whole padding story**,
   * so a host never stacks a raw `p-*` on the `inset-field` intent (both survive
   * `cn()` and the intent wins in CSS order, so the override silently no-ops).
   *
   * - `default` — the station rails' dock: `inset-field` + the 32px field = 49px.
   * - `row` — drops the vertical padding so the band measures one nav row (~33px)
   *   instead of reading as a separate dock. The MasterNav spine passes this: its
   *   box sits in a list of 30px rows, not below a carton list.
   *
   * The 12px horizontal inset is identical in both, so the search glyph keeps
   * the same column as the nav rows' leading glyph. The `SearchField
   * size="compact"` control stays 32px either way — that is the floor's touch
   * target on a station rail, and it is not a spine's 2px to spend.
   */
  density?: 'default' | 'row';
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
        'shrink-0 border-t border-border-hairline bg-surface-card',
        density === 'row' ? 'px-3' : 'inset-field',
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

'use client';

/**
 * Search-by method picker — first dropdown the global header find field
 * shows on click. Option 0 is Recent searches (opens `/search` history).
 * Rows after that are Internal ID · order · tracking · serial · ticket.
 */

import { Clock, Hash, MapPin, QrCode, ScanBarcode, Ticket } from '@/components/Icons';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  SEARCH_BY_METHOD_HINT,
  SEARCH_BY_METHOD_LABEL,
  SEARCH_BY_RECENTS_VALUE,
  SEARCH_BY_SCOPES,
  searchByPickerValue,
  searchByShortcut,
  type SearchByScope,
} from '@/lib/search/search-by';
import { cn } from '@/utils/_cn';
import type { ComponentType } from 'react';

const METHOD_ICON: Record<SearchByScope, ComponentType<{ className?: string }>> = {
  internal: QrCode,
  order: Hash,
  tracking: MapPin,
  serial: ScanBarcode,
  ticket: Ticket,
};

export function SearchByMethods({
  listboxId,
  optionId,
  activeIndex,
  selected,
  recentsActive = false,
  onSelect,
  onSelectRecents,
}: {
  listboxId: string;
  optionId: (index: number) => string;
  activeIndex: number;
  selected: SearchByScope;
  recentsActive?: boolean;
  onSelect: (scope: SearchByScope) => void;
  onSelectRecents: () => void;
}) {
  const highlighted = searchByPickerValue(activeIndex);
  const recentsHighlighted = activeIndex === 0;

  return (
    <Command
      shouldFilter={false}
      value={highlighted || SEARCH_BY_RECENTS_VALUE}
      role="presentation"
      className="rounded-none bg-transparent"
    >
      <CommandList id={listboxId} className="max-h-none">
        <CommandGroup>
          <CommandItem
            id={optionId(0)}
            value={SEARCH_BY_RECENTS_VALUE}
            aria-selected={recentsHighlighted}
            onMouseDown={(e) => e.preventDefault()}
            onSelect={onSelectRecents}
            className={cn(recentsHighlighted && 'bg-surface-hover', recentsActive && 'font-semibold')}
          >
            <Clock className="size-3.5 text-text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-role-caption font-medium text-text-default">
                Recent searches
              </span>
              <span className="block text-role-micro text-text-faint">
                Open search history
              </span>
            </span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Search by">
          {SEARCH_BY_SCOPES.map((scope, methodIndex) => {
            const index = methodIndex + 1;
            const Icon = METHOD_ICON[scope];
            const shortcut = searchByShortcut(scope);
            const active = index === activeIndex;
            return (
              <CommandItem
                key={scope}
                id={optionId(index)}
                value={scope}
                data-axis-chip={scope}
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onSelect={() => onSelect(scope)}
                className={cn(active && 'bg-surface-hover', selected === scope && 'font-semibold')}
              >
                <Icon className="size-3.5 text-text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-role-caption font-medium text-text-default">
                    {SEARCH_BY_METHOD_LABEL[scope]}
                  </span>
                  <span className="block text-role-micro text-text-faint">
                    {SEARCH_BY_METHOD_HINT[scope]}
                  </span>
                </span>
                {shortcut ? <CommandShortcut>{shortcut}</CommandShortcut> : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

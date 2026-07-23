'use client';

/**
 * ToolbarSearchToggle — SoT for workbench chrome scoped search.
 *
 * Collapsed: ghost Search icon. Expanded on hover / focus / click (or when
 * `value` is non-empty): compact {@link SearchField}. Blur with an empty
 * query collapses again so the resting header stays an icon rail.
 * Pointer leave does not collapse while the field (or a child) holds focus.
 *
 * Use in `WorkbenchChromeHeader` `search` slots (Unbox / History / Incoming /
 * Outbound / …). Always-open {@link SearchField} is for modal pickers, station
 * scan strips, and other non-chrome surfaces — not quiet workbench rails.
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchField, type SearchFieldTone } from '@/design-system/primitives/SearchField';
import { cn } from '@/utils/_cn';

export function ToolbarSearchToggle({
  value,
  onChange,
  onClear,
  placeholder = 'Filter…',
  tone = 'blue',
  isSearching = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  tone?: SearchFieldTone;
  /** Spins the SearchField trailing loader while a fetch is in flight. */
  isSearching?: boolean;
  className?: string;
}) {
  const hasValue = Boolean(value.trim());
  const [expanded, setExpanded] = useState(hasValue);
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  valueRef.current = value;

  useEffect(() => {
    if (hasValue) setExpanded(true);
  }, [hasValue]);

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  const clearCollapseTimer = () => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  };

  const expand = () => {
    clearCollapseTimer();
    setExpanded(true);
  };

  const tryCollapse = () => {
    const root = rootRef.current;
    if (root?.contains(document.activeElement)) return;
    if (!valueRef.current.trim()) setExpanded(false);
  };

  const scheduleCollapse = () => {
    clearCollapseTimer();
    collapseTimer.current = setTimeout(tryCollapse, 160);
  };

  if (!expanded) {
    return (
      <div
        ref={rootRef}
        className={cn('min-w-0', className)}
        onMouseEnter={expand}
        onFocusCapture={expand}
      >
        <HoverTooltip label={placeholder} asChild>
          <ToolbarButton
            iconOnly
            aria-label={placeholder}
            aria-expanded={false}
            onClick={expand}
          >
            <Search className="h-3.5 w-3.5" />
          </ToolbarButton>
        </HoverTooltip>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn('min-w-0', className)}
      onMouseEnter={clearCollapseTimer}
      onMouseLeave={scheduleCollapse}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        tryCollapse();
      }}
    >
      <SearchField
        value={value}
        onChange={onChange}
        onClear={() => {
          onClear?.();
          onChange('');
          setExpanded(false);
        }}
        placeholder={placeholder}
        tone={tone}
        size="compact"
        isSearching={isSearching}
        autoFocus
        // pr matches ToolbarButton inset so the trailing paste sits on the
        // same optical column as the collapsed search icon (w-8 centered).
        className="w-40 shrink-0 pr-2 lg:w-56"
      />
    </div>
  );
}

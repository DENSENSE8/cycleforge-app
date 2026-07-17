'use client';

/**
 * ToolbarSearchToggle — icon-first scoped search for workbench chrome.
 *
 * Collapsed: square Search {@link ToolbarButton}. Expanded (click, or when
 * `value` is non-empty): compact {@link SearchField}. Blur with an empty
 * query collapses again so the resting header stays an icon rail.
 */

import { useEffect, useState } from 'react';
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
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  tone?: SearchFieldTone;
  className?: string;
}) {
  const hasValue = Boolean(value.trim());
  const [expanded, setExpanded] = useState(hasValue);

  useEffect(() => {
    if (hasValue) setExpanded(true);
  }, [hasValue]);

  if (!expanded) {
    return (
      <HoverTooltip label={placeholder} asChild>
        <ToolbarButton
          iconOnly
          aria-label={placeholder}
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className={className}
        >
          <Search className="h-3.5 w-3.5" />
        </ToolbarButton>
      </HoverTooltip>
    );
  }

  return (
    <div
      className={cn('min-w-0', className)}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (!hasValue) setExpanded(false);
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
        autoFocus
        className="w-40 shrink-0 lg:w-56"
      />
    </div>
  );
}

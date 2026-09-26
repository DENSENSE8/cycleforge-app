'use client';

/**
 * `RecordFullId` — an identifier in a details panel, shown IN FULL (owner
 * 2026-09-26): no brand dot, no last-8 chip — the whole order / tracking
 * number. The number itself is the copy target: hover shows "Copy …", a click
 * copies and the tooltip answers "Copied". No separate copy button.
 * List rows keep the compact chip faces; this is the details-panel face.
 */

import { useState } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function RecordFullId({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied: the value stays selectable.
    }
  };

  return (
    <HoverTooltip label={copied ? 'Copied' : `Copy ${label}`} asChild placement="above">
      <button
        type="button"
        onClick={copy}
        data-identity={label}
        className={cn(
          'ds-raw-button -ml-1 min-w-0 truncate rounded-mode-control px-1 text-left text-mode-ink hover:bg-mode-hover',
          RECORD_ID_CLASS,
          focusRing('control'),
          className,
        )}
      >
        {value}
      </button>
    </HoverTooltip>
  );
}

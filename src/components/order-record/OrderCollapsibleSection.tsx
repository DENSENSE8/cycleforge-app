'use client';

/**
 * OrderCollapsibleSection — default-collapsed disclosure for secondary history
 * lanes (Serial Journey, Conversation) so the record stays concise.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from '@/components/Icons';
import { Panel } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function OrderCollapsibleSection({
  title,
  description,
  children,
  defaultOpen = false,
  /** Bound the body height (e.g. Conversation thread scroll). */
  bodyClassName,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Panel padding="none" className="overflow-hidden">
      {/* ds-raw-button: native disclosure toggle for a collapsible section. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-sunken"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-role-caption font-semibold text-text-default">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-role-micro font-medium text-text-muted">
              {description}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className={cn('border-t border-border-hairline', bodyClassName)}>{children}</div>
      ) : null}
    </Panel>
  );
}

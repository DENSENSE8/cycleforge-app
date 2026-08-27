'use client';

/**
 * Unbox Band-1 leading Pin list — pin an extra list tab from the closed catalog
 * (`unbox-extra-tabs`). Small popover (not a right rail): ephemeral pick only.
 *
 * The trigger is a PUSHPIN (`Pin`), never a bare leading `+`. A `+` reads as
 * "create a new table / schema" (the Airtable/Sheets misread this station must
 * never make); a pushpin reads as "pin one of these existing lists here", which
 * is exactly the closed-catalog job. Popover copy stays catalog label +
 * description — no "Create…" verbs (Gemini D6 / D12 · C14).
 *
 * Face: the Band-1 cube ({@link WORKBENCH_CHROME_CUBE_CLASS}) — whisper fill,
 * no rest-state box — same flush peer face as every trailing utility CTA on
 * the row. Never a naked header glyph.
 *
 * Plan: `docs/todo/unbox-pinned-inbound-tab-PLAN.md`.
 */

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Pin } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WorkbenchFilterGroupLabel } from '@/components/dashboard/workbench-filter-popover';
import {
  WORKBENCH_CHROME_CUBE_CLASS,
  WORKBENCH_CHROME_CUBE_GLYPH_CLASS,
} from '@/components/dashboard/workbench-chrome-cube';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  UNBOX_PINNED_EXTRA_TABS_MAX,
  type UnboxExtraTabDef,
} from '@/lib/receiving/unbox-extra-tabs';
import { focusRing } from '@/design-system/tokens/focus-ring';


export function UnboxAddListPopover({
  available,
  atCap = false,
  onPin,
}: {
  available: readonly UnboxExtraTabDef[];
  /** At {@link UNBOX_PINNED_EXTRA_TABS_MAX} pins — catalog rows go disabled. */
  atCap?: boolean;
  onPin: (id: UnboxExtraTabDef['id']) => void;
}) {
  const [open, setOpen] = useState(false);
  const empty = available.length === 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <HoverTooltip label="Pin a list to this strip" asChild>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Pin a list to this strip"
            aria-expanded={open}
            data-testid="unbox-pin-list"
            className={cn(
              WORKBENCH_CHROME_CUBE_CLASS,
              open && 'bg-surface-sunken text-text-muted',
            )}
          >
            <Pin className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} aria-hidden />
          </button>
        </Popover.Trigger>
      </HoverTooltip>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            cn('z-dropdown w-64 overflow-hidden border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5', focusRing('field', 'accent')),
            cornerClass('flush'),
          )}
        >
          <WorkbenchFilterGroupLabel>Pin list</WorkbenchFilterGroupLabel>
          {empty ? (
            <p className="px-2 py-1.5 text-role-caption text-text-faint">All lists pinned</p>
          ) : (
            <>
              {available.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  disabled={atCap}
                  aria-disabled={atCap}
                  className={cn(
                    'ds-raw-button flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    atCap
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-surface-hover focus-visible:bg-surface-hover',
                  )}
                  onClick={() => {
                    if (atCap) return;
                    setOpen(false);
                    onPin(entry.id);
                  }}
                >
                  <span className="text-role-caption font-medium text-text-default">
                    {entry.label}
                  </span>
                  <span className="text-role-micro text-text-faint">{entry.description}</span>
                </button>
              ))}
              {atCap ? (
                <p
                  className="px-2 py-1.5 text-role-micro text-text-faint"
                  data-testid="unbox-pin-cap-note"
                >
                  {UNBOX_PINNED_EXTRA_TABS_MAX} lists pinned — unpin one to add another
                </p>
              ) : null}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

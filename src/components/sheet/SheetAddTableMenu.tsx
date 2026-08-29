'use client';

/**
 * The bottom strip's **+** — the org's table catalog, as a checklist.
 *
 * ```text
 * [ To-ship ] [ Tested ] [ Packed ]  +
 *                                    └─ ☑ To-ship      ☐ FBA board
 *                                       ☑ Unbox        ☐ Walk-in
 *                                       ☑ Repair       ☐ Bins
 * ```
 *
 * ## Why a checklist and not "create a table"
 *
 * The product ships ~20 table surfaces and no org uses all of them. "Add a
 * table" here means **turn one of ours on**, not mint a new one with its own
 * columns and rows — that is a different, much larger feature and is not this.
 * A checklist says so at a glance; a "New table…" button would promise the
 * other thing.
 *
 * Turning a table off removes it for **everyone in the org**, so the control is
 * read-only for an operator without `admin.manage_features` — visible, because
 * knowing what the org runs is useful, and inert, because it is not their
 * decision. The API enforces this; the UI just stops offering a lie.
 */

import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { useOrgTableCatalog } from '@/hooks/useOrgTableCatalog';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function SheetAddTableMenu({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const { catalog, setEnabled, isLoading } = useOrgTableCatalog();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <HoverTooltip
        label={canManage ? 'Add or remove a table' : 'Tables this organization runs'}
        asChild
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={canManage ? 'Add or remove a table' : 'Tables this organization runs'}
            aria-expanded={open}
            data-testid="sheet-add-table"
            className={cn(
              'ds-raw-button inline-flex shrink-0 items-center justify-center px-2',
              PRIMARY_CHROME_ROW_FACE,
              cornerClass('flush'),
              focusRing('control'),
              'text-text-faint transition-colors duration-100 ease-out',
              'hover:bg-surface-hover hover:text-text-default',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </Popover.Trigger>
      </HoverTooltip>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={4}
          className={cn(
            'z-dropdown max-h-80 w-64 overflow-y-auto rounded-lg border border-border-soft bg-surface-card p-1 shadow-md ring-1 ring-black/5',
            focusRing('field', 'accent'),
          )}
          data-testid="sheet-add-table-menu"
        >
          <p className="px-2 py-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            {canManage ? 'Tables' : 'Tables this org runs'}
          </p>
          {isLoading ? (
            <p className="px-2 py-1.5 text-role-micro text-text-soft">Loading…</p>
          ) : null}
          {catalog.map((entry) => (
            <label
              key={entry.tableId}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 text-role-caption',
                canManage
                  ? 'cursor-pointer text-text-default hover:bg-surface-hover'
                  : 'text-text-soft',
              )}
              data-testid={`sheet-add-table-${entry.tableId}`}
            >
              <input
                type="checkbox"
                checked={entry.enabled}
                disabled={!canManage}
                onChange={(e) => setEnabled(entry.tableId, e.target.checked)}
                className={cn('h-3.5 w-3.5 shrink-0', focusRing('control'))}
              />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </label>
          ))}
          {!isLoading && catalog.length === 0 ? (
            <p className="px-2 py-1.5 text-role-micro text-text-soft">
              No tables are registered in this build.
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

'use client';

/** Band-3 **Views** menu — the PAGE-WIDE saved-views control for ops-queue / workbench data tables. */

import { useState } from 'react';
import { Bookmark } from '@/components/Icons';
import { SavedViewsList } from '@/components/saved-views/SavedViewsList';
import { useSavedViews } from '@/hooks/useSavedViews';
import { cn } from '@/utils/_cn';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import {
  DATA_TABLE_TOOLBAR_CORNER,
  DROPDOWN_SHELL_CORNER,
} from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function WorkbenchViewsMenu({
  storageKey,
  paramKeys,
  emptyHint,
  className,
}: {
  storageKey: string;
  paramKeys: readonly string[];
  emptyHint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const controller = useSavedViews({ storageKey, paramKeys });
  const tip = controller.activeView ? controller.activeView.name : 'Views';


  return (
    <div className={cn('relative inline-flex shrink-0 items-center', className)}>
      <ViewsMenuShell
        open={open}
        tip={tip}
        active={Boolean(controller.activeView)}
        onToggle={() => setOpen((o) => !o)}
        onClose={() => setOpen(false)}
      >
        <SavedViewsList
          storageKey={storageKey}
          paramKeys={paramKeys}
          hideHeader
          emptyHint={emptyHint}
          controller={{
            ...controller,
            applyView: (view) => {
              controller.applyView(view);
              setOpen(false);
            },
            clearView: () => {
              controller.clearView();
              setOpen(false);
            },
          }}
        />
      </ViewsMenuShell>
    </div>
  );
}

/** The Views **face** — flush Bookmark trigger + the same `Popover` / {@link DROPDOWN_SHELL_CORNER} panel as DataTable Sort and Filter,… */
export function ViewsMenuShell({
  open,
  tip,
  active,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  /** Visible label + tooltip + aria: the active view's name, else `Views`. */
  tip: string;
  /**
   * A saved view is currently applied. Pass `false` where the surface cannot
   * honestly tell — a wrong "active" badge is chrome inventing a second story.
   */
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const lit = open || active;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
        else if (!open) onToggle();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `Saved view: ${tip}` : 'Saved views'}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-pressed={lit}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center gap-1 px-1.5 text-role-caption',
            // Colour only — ops chrome never tweens a neighbour's position.
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            DATA_TABLE_TOOLBAR_CORNER,
            focusRing('control'),
            lit
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <Bookmark className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[12ch] truncate">{tip}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        aria-label="Saved views"
        data-testid="data-table-views-menu"
        onEscapeKeyDown={() => onClose()}
        className={cn(
          // Same named exemption Sort and Filter pass — the primitive already
          // applies it, the import at this call site is the contract that a
          // sibling a thumb-width away cannot disagree about corners.
          DROPDOWN_SHELL_CORNER,
          'w-72 overflow-hidden p-0.5',
          focusRing('field', 'accent'),
        )}
      >
        <div className="p-1.5">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

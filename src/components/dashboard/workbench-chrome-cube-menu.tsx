'use client';

/**
 * Band-1 chrome MENU — one trigger, one panel, tabs inside.
 *
 * **The law this exists to enforce: controls under one topic are TABS inside
 * one control, never a row of separated icons.** A band that reads
 * `[⇩] [☑] [+]` makes an operator parse three glyphs to find one job and spends
 * three cells of a row whose width the tab rail needs; the same three verbs as
 * tabs inside a single control cost one cell and name themselves in words.
 *
 * ```text
 *   BANNED                        REQUIRED (cube)
 *   [⇩] [☑] [+] [ UNBOX ]         [+] [ UNBOX ]
 *    three cells, no words         one cell → verbs as tabs
 * ```
 *
 * Default trigger is the quiet {@link WORKBENCH_CHROME_CUBE_CLASS} glyph.
 * Pass `labeledTrigger` for an Unbox-style solid peer CTA (Import on To-ship)
 * that still hosts same-topic tabs in the panel.
 *
 * Separate cells are correct only when the controls are genuinely different
 * TOPICS — the leading pin (which list is on this strip) is not the same topic
 * as the trailing data menu, so it keeps its own cell.
 */

import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_CUBE_CLASS } from '@/components/dashboard/workbench-chrome-cube';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


export interface WorkbenchChromeMenuTab {
  id: string;
  /** Tab label — a VERB, in words. This is what replaces the bare glyph. */
  label: string;
  content: ReactNode;
}

export function WorkbenchChromeCubeMenu({
  label,
  icon,
  tabs,
  panelWidth = '20rem',
  align = 'end',
  labeledTrigger,
  'data-testid': testId,
}: {
  /** Tooltip + accessible name for the one cube — the TOPIC, not a verb. */
  label: string;
  icon: ReactNode;
  /** Two or more verbs under that topic. One tab renders without the strip. */
  tabs: readonly WorkbenchChromeMenuTab[];
  panelWidth?: string;
  align?: 'start' | 'end';
  /**
   * When set, the trigger is a labeled solid Button (Unbox peer face) instead
   * of the quiet cube. `children` is the visible verb; `label` stays the
   * accessible / tooltip name.
   */
  labeledTrigger?: {
    children: string;
    variant?: 'primary' | 'secondary';
    className?: string;
    icon?: ReactNode;
  };
  'data-testid'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const trigger = labeledTrigger ? (
    <Popover.Trigger asChild>
      <Button
        size="sm"
        variant={labeledTrigger.variant ?? 'secondary'}
        icon={labeledTrigger.icon ?? icon}
        ariaLabel={label}
        aria-expanded={open}
        className={labeledTrigger.className}
        data-testid={testId}
      >
        {labeledTrigger.children}
      </Button>
    </Popover.Trigger>
  ) : (
    <HoverTooltip label={label} asChild>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          data-testid={testId}
          className={cn(
            WORKBENCH_CHROME_CUBE_CLASS,
            open && 'bg-surface-hover text-text-muted',
          )}
        >
          {icon}
        </button>
      </Popover.Trigger>
    </HoverTooltip>
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopen on the first verb — a menu that remembers a tab makes the
        // same click do different things on different days.
        if (!next) setActiveId(null);
      }}
    >
      {trigger}
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          style={{ width: panelWidth }}
          className={cn("z-dropdown rounded-2xl border border-border-soft bg-surface-card p-3 shadow-xl ring-1 ring-black/5", focusRing('field', 'accent'))}
        >
          {tabs.length > 1 ? (
            <div className="mb-3 flex items-center gap-1 rounded-xl bg-surface-sunken p-1">
              {tabs.map((tab) => (
                // ds-raw-button: segmented tab toggle (conditional active fill),
                // not a single-variant Button.
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveId(tab.id)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-1.5 text-role-eyebrow uppercase tracking-wider transition-colors',
                    tab.id === active.id
                      ? 'bg-surface-card text-text-accent shadow-sm'
                      : 'text-text-soft hover:text-text-muted',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
          {active.content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

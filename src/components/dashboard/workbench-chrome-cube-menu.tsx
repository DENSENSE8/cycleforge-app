'use client';

/**
 * Band-1 cube MENU — one cube trigger, one panel, tabs inside.
 *
 * **The law this exists to enforce: controls under one topic are TABS inside
 * one control, never a row of separated icons.** A band that reads
 * `[⇩] [☑] [+]` makes an operator parse three glyphs to find one job and spends
 * three cells of a row whose width the tab rail needs; the same three verbs as
 * tabs inside a single `+` cost one cell and name themselves in words.
 *
 * ```text
 *   BANNED                        REQUIRED
 *   [⇩] [☑] [+] [ UNBOX ]         [+] [ UNBOX ]
 *    three cells, no words         one cell → Add · Check · Export
 * ```
 *
 * Separate cells are correct only when the controls are genuinely different
 * TOPICS — the leading pin (which list is on this strip) is not the same topic
 * as the trailing data menu, so it keeps its own cube.
 *
 * The trigger is {@link WORKBENCH_CHROME_CUBE_CLASS}, so the menu sits as a peer
 * of the band's other cells. Return-to-scan stays a solid Button beside it
 * (`AGENTS.md` → return-to-scan) — that is a different topic and the one
 * control on the row that is not a utility.
 */

import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_CUBE_CLASS } from '@/components/dashboard/workbench-chrome-cube';
import { cn } from '@/utils/_cn';

export interface WorkbenchChromeMenuTab {
  id: string;
  /** Tab label — a VERB, in words. This is what replaces the bare glyph. */
  label: string;
  content: ReactNode;
}

/**
 * One CTA + a line saying what it opens — the body shape for a tab whose whole
 * job is a single action, so a tab never renders a naked button.
 */
export function WorkbenchChromeMenuAction({
  label,
  description,
  icon,
  onClick,
  disabled = false,
  ariaLabel,
  'data-testid': testId,
}: {
  label: string;
  description: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  'data-testid'?: string;
}) {
  return (
    <div className="space-y-3">
      <Button
        variant="primary"
        size="lg"
        onClick={onClick}
        disabled={disabled}
        ariaLabel={ariaLabel ?? label}
        icon={icon}
        className="w-full text-role-micro uppercase tracking-[0.2em]"
        data-testid={testId}
      >
        {label}
      </Button>
      <p className="px-0.5 text-role-micro text-text-faint">{description}</p>
    </div>
  );
}

export function WorkbenchChromeCubeMenu({
  label,
  icon,
  tabs,
  panelWidth = '20rem',
  align = 'end',
  'data-testid': testId,
}: {
  /** Tooltip + accessible name for the one cube — the TOPIC, not a verb. */
  label: string;
  icon: ReactNode;
  /** Two or more verbs under that topic. One tab renders without the strip. */
  tabs: readonly WorkbenchChromeMenuTab[];
  panelWidth?: string;
  align?: 'start' | 'end';
  'data-testid'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

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
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          style={{ width: panelWidth }}
          className="z-dropdown rounded-2xl border border-border-soft bg-surface-card p-3 shadow-xl ring-1 ring-black/5 focus:outline-none"
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


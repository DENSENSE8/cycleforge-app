'use client';

/**
 * THE BEAM. Identity on the left, last-hovered entity readout in the middle,
 * kebab on the right. Composer and assistant never steal the readout.
 *
 * What left, and why it could leave:
 *   · BOTH RAIL TOGGLES — the left rail is always mounted now, so its
 *     toggle had nothing to toggle. The right rail keeps ⌘⇧B and its
 *     hover hot-zone (see the flagged consequence in the handoff).
 *   · THE TIMER FACE — "remove any time displays". Elapsed still rides
 *     every parked block in the queue, which is where it is actually read.
 *   · SEARCH AND ADD — gone one ruling earlier, down to the rail.
 *
 * Bottom hairline restored 2026-08-25 (`border-bottom` on `.wos-header`) —
 * the 1px separator between the beam and the canvas. The 2026-08-24
 * "blend into the edge plane" ruling is reversed.
 *
 * THE SESSION TITLE STAYS. "Top Left: ONLY a single, circular staff
 * avatar" reads as an exclusion list for CHROME CONTROLS — it names
 * sign-in text, workspace names and toggles, not the session title, which
 * the immediately preceding ruling put here on purpose. It also cannot go
 * anywhere else: the same ruling bars it from the canvas, and the rail is
 * now icons-only. Removing it would delete the active session's name from
 * the entire interface, so it stays until that is ruled explicitly.
 */

import { useState } from 'react';
import { CalendarDaysIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IdentityMenu } from '@/shell/IdentityMenu';
import { HeaderEntityReadout } from '@/shell/HeaderEntityReadout';
import { Icon } from '@/shell/icons';
import { TOOLS, blockElapsedSeconds, toolAvailable, type SessionBlock } from '@/shell/model';
import { railIconPlate } from '@/shell/rail-icon';
import { hhmmss } from '@/shell/clock';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

/** The chronology's blocks that STARTED today, newest first — the session
 *  dropdown's rows (operator, 2026-08-24: click the session name for
 *  "your previous sessions for the current day"). */
function todaysBlocks(shell: ShellApi): readonly SessionBlock[] {
  const dayStart = new Date().setHours(0, 0, 0, 0);
  return shell.feed
    .filter(
      (e): e is SessionBlock => e.kind === 'block' && (e.intervals[0]?.start ?? 0) >= dayStart,
    )
    .reverse();
}

/**
 * THE SESSIONS CLUSTER (operator, 2026-08-24/25): staff icon · a `+` that
 * appears ON HOVER of the session name and cuts a new session · the name
 * itself as a DROPDOWN of today's sessions (single click), an INLINE
 * RENAME (double click — the popover's name field moved here), and the
 * week's sessions opening as a TILE (C8 — triage happens on a tile,
 * never in a menu).
 */
function SessionSwitcher({ shell }: { shell: ShellApi }) {
  const blocks = todaysBlocks(shell);
  const now = Date.now();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const commitRename = () => {
    if (draft && draft.trim()) shell.renameArmedSession(draft);
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') setDraft(null);
        }}
        aria-label="Rename this session"
        className="h-7 w-44"
      />
    );
  }

  return (
    /* `modal={false}`: the modal overlay would swallow the second click of
       a double-click before the trigger ever saw it — rename depends on
       the trigger staying clickable while the menu is up. */
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="header-session cursor-pointer"
          title="Click: today's sessions · double-click: rename"
          onDoubleClick={(e) => {
            e.preventDefault();
            if (!shell.sessionName) return; // nothing armed to rename
            setOpen(false);
            setDraft(shell.sessionName);
          }}
        >
          {shell.sessionName || 'No session'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Today</DropdownMenuLabel>
        {blocks.length === 0 ? (
          <DropdownMenuItem disabled>No sessions yet — + starts one</DropdownMenuItem>
        ) : (
          blocks.map((b) => (
            <DropdownMenuItem
              key={b.id}
              disabled={b.state === 'ended'}
              onSelect={() => {
                if (b.state === 'parked') shell.resumeBlock(b.ref);
              }}
            >
              <span className="flex-1 truncate">{b.title}</span>
              <span className="mono text-xs text-muted-foreground">
                {b.state === 'armed' ? 'current' : b.state} ·{' '}
                {hhmmss(blockElapsedSeconds(b.intervals, now))}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={shell.openSessionsWeekTile}>
          <CalendarDaysIcon />
          This week&apos;s sessions…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function GlobalHeader({ shell }: { shell: ShellApi }) {
  return (
    <header className="wos-header">
      <IdentityMenu shell={shell} />

      {/* The `+` between the staff icon and the session name — a click
          twin of ⌘N. THE NAME MAKES ROOM (operator, 2026-08-25, superseding
          the opacity-in-place reveal): idle is staff icon then name with no
          gap; hovering the session cluster renders the `+` to the name's
          LEFT and the name shifts right to make room. A conditional
          `display` swap — the shift is an INSTANT layout change, never a
          tween (M1). `group-focus-within` keeps it reachable when the
          cluster holds keyboard focus; ⌘N remains the keyboard twin. */}
      <span className="group/session flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'hidden size-7 group-hover/session:inline-flex group-focus-within/session:inline-flex',
                railIconPlate,
              )}
              aria-label="New session (Ctrl+N) — parks the current one"
              onClick={shell.cutSession}
            >
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New session — parks the current one</TooltipContent>
        </Tooltip>

        <SessionSwitcher shell={shell} />
      </span>

      <HeaderEntityReadout entity={shell.headerEntity} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1 px-2', railIconPlate)}
            aria-label="Boxes packed today"
            onClick={shell.openPackedTodayTile}
          >
            <Icon name="box" size={14} />
            Packed
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Boxes packed by packer</TooltipContent>
      </Tooltip>

      {/* THE TOOLS ENTRY (operator, 2026-08-25 — supersedes B22's "no tool
          overflow in the beam", struck per X3). The ⋯ used to open the
          SessionPopover (session facts + park/close); those verbs moved to
          the composer's session header, so this corner is free to be what
          the operator asked for: the way into the tools — readout · timer ·
          stopwatch and the rest of the roster. Session-scoped tools appear
          only while a session is armed (T6). */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-7', railIconPlate)}
                aria-label="Tools"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Tools — timer · stopwatch · readout</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Tools</DropdownMenuLabel>
          {TOOLS.filter((tool) => toolAvailable(tool, shell.sessionState, shell.activeRef)).map(
            (tool) => (
              <DropdownMenuItem key={tool.key} onSelect={() => shell.toggleTool(tool.key)}>
                <Icon name={tool.icon} size={14} />
                {tool.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

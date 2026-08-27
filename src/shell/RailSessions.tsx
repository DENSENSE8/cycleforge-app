'use client';

/**
 * LEFT RAIL — ICONS ONLY, ALWAYS MOUNTED (2026-08-24, operator ruling),
 * now on shadcn `Button` + `Tooltip`.
 *
 * The rail is exclusively "a vertical stack of minimalist, outlined
 * icons": no text labels, no expand control, no background container.
 *
 * TOOLTIPS REPLACE `title=`. A native `title` is browser chrome — a fixed
 * ~1s delay, unstyleable, and it never appears for a keyboard user at
 * all. On a rail where the ICON IS THE ONLY LABEL, that made every
 * control unnameable without a pointer. `Tooltip` renders the same string
 * on hover AND on focus, and `aria-label` still carries it for a screen
 * reader.
 *
 * Consequences of the icons-only ruling, still true:
 *   · `useRailPeek` / `leftRailOpen` no longer drive this rail; ⌘B is
 *     unbound for the left side.
 *   · Recents are gone — they were a banded list of titles and subtitles,
 *     which the ruling excludes. `shell.recents` still holds the data.
 */

import { CircleHelpIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/shell/icons';
import { railIconActive, railIconBare, railIconPlate } from '@/shell/rail-icon';
import type { SessionBlock } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

function RailButton({
  label,
  onClick,
  onContextMenu,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8', railIconPlate, active && railIconActive)}
          aria-label={label}
          onClick={onClick}
          onContextMenu={onContextMenu}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function lastFeedBlock(feed: ShellApi['feed'], ref: string): SessionBlock | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i];
    if (e.kind === 'block' && e.ref === ref) return e;
  }
  return null;
}

export function RailSessions({ shell }: { shell: ShellApi }) {
  return (
    /* Order (operator, 2026-08-24): SEARCH sits at the top, directly
       under the beam's staff icon — the `+` moved up INTO the beam,
       between that icon and the session name. Then the pins, then this
       session's open pages (pages are per session — the Spaces model). */
    <nav className="flex w-10 shrink-0 flex-col items-center gap-0.5 py-1" aria-label="Sessions">
      <RailButton label="Search (Ctrl+K)" onClick={() => shell.openLauncher('')}>
        <SearchIcon />
      </RailButton>

      {shell.pins.map((pin) => (
        <RailButton
          key={pin.id}
          label={`${pin.title} — pinned`}
          onClick={() => shell.openTile(pin.id, pin.title, 'table')}
        >
          <Icon name={pin.icon} size={16} />
        </RailButton>
      ))}

      {shell.tabs.map((tab) => {
        const block = lastFeedBlock(shell.feed, tab.ref);
        const purpose = block?.purposeLabel;
        const label = purpose ? `${tab.title} · ${purpose}` : tab.title;
        return (
          <RailButton
            key={tab.ref}
            label={label}
            active={tab.ref === shell.activeRef}
            onClick={() => shell.focusRef(tab.ref)}
            onContextMenu={(e) => {
              e.preventDefault();
              const tile = shell.tiles.find((t) => t.ref === tab.ref);
              shell.setContextMenu({ x: e.clientX, y: e.clientY, tileId: tile?.id ?? null });
            }}
          >
            <Icon name={tab.icon} size={16} />
          </RailButton>
        );
      })}

      {/* `?` — PINNED MOST BOTTOM-LEFT (operator, 2026-08-24), the Linear
          pattern. Hover: the quick basics. Click: the Help TILE, placed
          leftmost on the canvas (C8 — help is a tile like everything
          else). It replaced the keycap legend that rode the composer. */}
      <div className="mt-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-8 rounded-full', railIconBare)}
              aria-label="Help — keys and the one field"
              onClick={shell.openHelpTile}
            >
              <CircleHelpIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span className="mono">#</span> order · <span className="mono">/</span> action ·{' '}
            <span className="mono">filter:</span> narrow the queue · scans always land in the
            field — click for the full legend
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}

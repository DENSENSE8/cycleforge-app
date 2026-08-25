'use client';

/**
 * THE FLOATING SURFACES — on shadcn primitives (2026-08-24).
 *
 * These were four hand-rolled surfaces "defined by a 1–2px stroke alone:
 * with no radius and no elevation there is nothing else to separate one
 * surface from the next." Both halves of that sentence are now obsolete:
 * LAW 1 grants controls a radius and LAW 3 grants overlays one shadow
 * token, so a floating surface can look floating.
 *
 * What each became, and what it gained:
 *   · ContextMenu   → `DropdownMenu` anchored to a virtual point. Radix
 *     owns collision flipping, so it no longer needs the hand-written
 *     `Math.min(x, innerWidth - 200)` clamp that guessed its own width.
 *   · SessionPopover → `Popover`. Focus is trapped and restored; the old
 *     one was a div that could be tabbed straight through.
 *   · SettingsPopover → `Popover` + `ToggleGroup`.
 *   · OfflineBanner → `Alert`.
 *
 * `stopPropagation` disappears everywhere. Every one of those calls
 * existed to survive `ShellRoot`'s document-level click-to-dismiss —
 * Radix dismisses on its own, so the workaround and the listener it
 * fought are both gone.
 */

import { BoxIcon, PaletteIcon, PencilIcon, Trash2Icon, WifiOffIcon, XIcon } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ShellApi } from '@/shell/useShell';

/** In the beam's flow band, not floating. */
export function OfflineBanner({ shell }: { shell: ShellApi }) {
  if (!shell.offline) return null;
  return (
    <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
      <WifiOffIcon />
      <span>Offline — changes queued locally</span>
    </Alert>
  );
}

/**
 * The tab context menu. Anchored to a zero-size element parked at the
 * click point, which is Radix's documented way to attach a menu to a
 * coordinate rather than to a trigger.
 */
export function ContextMenu({ shell }: { shell: ShellApi }) {
  const menu = shell.contextMenu;
  const close = () => shell.setContextMenu(null);
  const tileId = menu?.tileId ?? null;

  return (
    <DropdownMenu open={menu !== null} onOpenChange={(next) => { if (!next) close(); }}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          onSelect={() => {
            if (!tileId) return;
            const tile = shell.tiles.find((t) => t.id === tileId);
            // Still `window.prompt`. Replacing it with the in-place editor
            // the session title uses is a follow-up, not this migration.
            const next = tile ? window.prompt('Rename tab:', tile.title) : null;
            if (next) shell.renameTile(tileId, next);
          }}
        >
          <PencilIcon /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { if (tileId) shell.cycleTileIcon(tileId); }}>
          <BoxIcon /> Change icon
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { if (tileId) shell.cycleTileColor(tileId); }}>
          <PaletteIcon /> Change color
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => { if (tileId) shell.closeTile(tileId); }}>
          <Trash2Icon /> Close
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-sm font-medium">{title}</span>
      <Button variant="ghost" size="icon" className="size-6" aria-label={`Close ${title}`} onClick={onClose}>
        <XIcon />
      </Button>
    </div>
  );
}

/* `SessionPopover` is DELETED (operator ruling, 2026-08-25 —
   HANDOFF-session-composer-ux §5). Its facts were half hardcoded
   ("scan — packing") and its verbs (park/close) belong on the session's
   face — the composer's `SessionHeader` — while the beam's ⋯ becomes the
   tools entry. One session mouth, not two. */

/**
 * SETTINGS — the bottom-left corner's one panel. Theme lives here (a
 * palette swap is a preference, not a floor control), and so does a
 * second way to expand the tools rail.
 */
export function SettingsPopover({ shell }: { shell: ShellApi }) {
  return (
    <Popover open={shell.settingsPopoverOpen} onOpenChange={shell.setSettingsPopoverOpen}>
      <PopoverAnchor className="fixed bottom-2 left-11" />
      <PopoverContent align="start" side="top" className="w-64">
        <PanelHeader title="Settings" onClose={() => shell.setSettingsPopoverOpen(false)} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ToggleGroup aria-label="Theme">
              <ToggleGroupItem active={shell.theme === 'light'} onClick={() => shell.setTheme('light')}>
                Light
              </ToggleGroupItem>
              <ToggleGroupItem active={shell.theme === 'dark'} onClick={() => shell.setTheme('dark')}>
                Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {/* The Rails segment is gone (2026-08-25): both rails are
              always-mounted icon stacks now — the tools rail lost its
              labelled mode when it was rebuilt as the left rail's mirror,
              so there is no rail state left to switch. */}
        </div>
      </PopoverContent>
    </Popover>
  );
}

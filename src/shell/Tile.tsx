'use client';

/**
 * A TILE — header (colour · title · type · overflow · close) + body.
 *
 * Four states, four distinct treatments, because in a tiling manager hover and
 * focus are different facts and one of them decides where the keystrokes go:
 *
 *   hover        1px grey inset ring, no fill
 *   focused      2px accent inset ring + accent header + edge bar
 *   dragging     dashed ring + 40% opacity
 *   snap-target  dashed accent ring + accent wash
 *
 * All four are `outline` or `background`, so none of them reflow.
 *
 * FOCUS FOLLOWS THE MOUSE — sloppy focus, the same rule as every tiling WM
 * that has it. Entering the tile focuses it; no click is spent on saying "this
 * one". `mousedown` is kept for touch, where there is no pointer to follow.
 * Focus is a class toggle, never a re-render of the body: a rebuild would
 * throw away a half-typed note and reset every tile's scroll position on every
 * sweep of the pointer.
 */

import { MoreHorizontalIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { TileBody } from '@/shell/TileBody';
import { splitHairline } from '@/shell/rail-icon';
import type { ShellTile } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

export function Tile({
  tile,
  shell,
  isLast,
}: {
  tile: ShellTile;
  shell: ShellApi;
  isLast: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [snapTarget, setSnapTarget] = useState(false);
  const focused = shell.focusedTileId === tile.id;

  const openMenu = (e: { clientX: number; clientY: number }) =>
    shell.setContextMenu({ x: e.clientX, y: e.clientY, tileId: tile.id });

  return (
    <div
      /* FOUR STATES, FOUR TREATMENTS — in a tiling manager hover and
         focus are different facts and one of them decides where the
         keystrokes go. All four are `outline` or colour, so none reflow:
         `outline` does not participate in layout (LAW 4), which is what
         lets the focus ring be 2px without nudging a pixel. */
      className={[
        'relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors',
        'hover:border-input',
        focused ? 'outline outline-2 -outline-offset-2 outline-edge-accent' : '',
        dragging ? 'opacity-50' : '',
        snapTarget ? 'outline outline-2 -outline-offset-2 outline-edge-accent bg-surface-accent' : '',
      ].filter(Boolean).join(' ')}
      data-id={tile.id}
      data-type={tile.type}
      onMouseEnter={() => shell.hoverTile(tile.id, tile.ref)}
      onMouseDown={() => shell.hoverTile(tile.id, tile.ref)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setSnapTarget(true);
      }}
      onDragLeave={() => setSnapTarget(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSnapTarget(false);
        const dragId = e.dataTransfer.getData('text/plain');
        if (dragId) shell.moveTile(dragId, tile.id);
      }}
    >
      <div
        className="flex h-7 shrink-0 cursor-grab items-center gap-2 border-b border-border px-2 active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          setDragging(true);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tile.id);
        }}
        onDragEnd={() => setDragging(false)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="size-2 shrink-0 rounded-sm" style={{ background: tile.color }} />
          <span className="truncate text-xs font-medium text-card-foreground">{tile.title}</span>
        </div>
        <span className="shrink-0 font-condensed text-technical font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {tile.type}
        </span>
        {/* Always present — an opacity reveal is a hover dependency, and a
            mounted tablet has no hover. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            aria-label="Tile menu"
            onClick={(e) => {
              e.stopPropagation();
              openMenu(e);
            }}
          >
            <MoreHorizontalIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 hover:bg-destructive/10 hover:text-destructive"
            aria-label="Close this tile and its tab (Ctrl+W)"
            onClick={(e) => {
              e.stopPropagation();
              shell.closeTile(tile.id);
            }}
          >
            <XIcon />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <TileBody tile={tile} shell={shell} />
      </div>

      {/* The prototype draws this handle and does not wire it — resize is
          still a `needsOutsideLane` question (the canvas store owns split
          ratios). Kept so the seam is visible rather than forgotten. */}
      {isLast ? null : (
        <div
          className={cn(
            'absolute inset-y-0 right-0 w-1 cursor-col-resize',
            splitHairline,
          )}
          title="Drag to resize"
        />
      )}
    </div>
  );
}

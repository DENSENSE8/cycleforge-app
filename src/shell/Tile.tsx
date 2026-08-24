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

import { useState } from 'react';
import { Icon } from '@/shell/icons';
import { TileBody } from '@/shell/TileBody';
import type { ShellTile } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

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
      className={`tile${focused ? ' focused' : ''}${dragging ? ' dragging' : ''}${snapTarget ? ' snap-target' : ''}`}
      data-id={tile.id}
      data-type={tile.type}
      onMouseEnter={() => shell.focusTile(tile.id)}
      onMouseDown={() => shell.focusTile(tile.id)}
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
        className="tile-header"
        draggable
        onDragStart={(e) => {
          setDragging(true);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tile.id);
        }}
        onDragEnd={() => setDragging(false)}
      >
        <div className="tile-identity">
          <span className="tile-color" style={{ background: tile.color }} />
          <span className="tile-title">{tile.title}</span>
        </div>
        <span className="tile-type">{tile.type}</span>
        {/* Always present — an opacity reveal is a hover dependency, and a
            mounted tablet has no hover. */}
        <div className="tile-actions">
          <button
            type="button"
            className="rail-btn rail-btn-xs"
            title="Tile menu"
            onClick={(e) => {
              e.stopPropagation();
              openMenu(e);
            }}
          >
            <Icon name="more" size={12} />
          </button>
          <button
            type="button"
            className="rail-btn rail-btn-xs tile-close"
            title="Close this tile and its tab (Ctrl+W)"
            onClick={(e) => {
              e.stopPropagation();
              shell.closeTile(tile.id);
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      </div>

      <div className="tile-body">
        <TileBody tile={tile} shell={shell} />
      </div>

      {/* The prototype draws this handle and does not wire it — resize is
          still a `needsOutsideLane` question (the canvas store owns split
          ratios). Kept so the seam is visible rather than forgotten. */}
      {isLast ? null : <div className="tile-split-handle" title="Drag to resize" />}
    </div>
  );
}

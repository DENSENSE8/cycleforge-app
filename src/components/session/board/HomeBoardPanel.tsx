'use client';

/**
 * HomeBoardPanel — the board that occupies the RIGHT pane.
 *
 * The grammar the operator asked for: tiles scroll LEFT/RIGHT as a rail, each
 * tile scrolls UP/DOWN through its own list, and a tile can expand to own the
 * whole pane. It is the warehouse-os window-manager idea (rail of boards, each
 * with its own scrollport) pointed at the assistant surface.
 *
 * ## It is a READ plane
 *
 * Same law as the artifact pane: tiles carry data, never behavior. A tile's
 * only action is to seed its question into the composer — the board is the
 * glanceable face, the agent is the interactive face, and both read the same
 * registered tools (`/api/home-board` dispatches through `runAssistantTool`).
 * Nothing here writes, so nothing here needs a confirm.
 *
 * ## Keyboard first
 *
 * `←`/`→` move between tiles, `↑`/`↓` scroll inside the focused tile, `Enter`
 * seeds that tile's question, `e` expands / collapses, `Esc` closes the board.
 * Mouse is an alias (session cohort law 4). Tiles are real buttons in flow
 * order, so Tab works without any of the above.
 *
 * ## Motion
 *
 * None. `SessionSurface` forbids geometry animation on this split ("width is
 * the ONLY thing that moves"), and an expanding tile is geometry. Expansion is
 * a hard swap; scroll uses native CSS snap.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { setSessionPanelOccupant } from '../session-panel-occupant';
import { BoardTile } from './BoardTile';
import type { BoardTilePayload } from './board-tiles';

interface BoardResponse {
  tiles?: BoardTilePayload[];
  loadedAt?: string;
}

export function HomeBoardPanel({ className }: { className?: string }) {
  const [tiles, setTiles] = useState<BoardTilePayload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Array<HTMLElement | null>>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/home-board', { cache: 'no-store' });
      if (!res.ok) throw new Error(`board request failed (${res.status})`);
      const body = (await res.json()) as BoardResponse;
      setTiles(body.tiles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The board could not load.');
      setTiles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (expanded ? (tiles ?? []).filter((t) => t.id === expanded) : (tiles ?? [])),
    [expanded, tiles],
  );

  /** Bring a tile into view and give it focus — the two always move together. */
  const focusTile = useCallback((index: number) => {
    setFocused(index);
    const el = tileRefs.current[index];
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
    el?.focus({ preventScroll: true });
  }, []);

  const onRailKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const count = visible.length;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (expanded) setExpanded(null);
        else setSessionPanelOccupant('artifact');
        return;
      }
      if (count === 0) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusTile(Math.min(focused + 1, count - 1));
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusTile(Math.max(focused - 1, 0));
        return;
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        const tile = visible[Math.min(focused, count - 1)];
        setExpanded(expanded ? null : (tile?.id ?? null));
        setFocused(0);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const tile = visible[Math.min(focused, count - 1)];
        // A tile's question is the handoff to the agent: the number the
        // operator is staring at becomes the rows behind it, in their words.
        if (tile) requestComposerSeed({ text: boardQuestionFor(tile), autoSend: false });
      }
    },
    [expanded, focusTile, focused, visible],
  );

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col bg-surface-canvas', className)}
      aria-label="Home board"
      data-home-board
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-3 py-1.5">
        <p className="text-role-caption font-semibold text-text-default">
          {expanded ? (visible[0]?.title ?? 'Board') : 'Home board'}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-role-micro text-text-faint">← → move · e expand · Enter ask</span>
          <Button variant="ghost" size="sm" onClick={() => void load()} ariaLabel="Refresh board">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSessionPanelOccupant('artifact')}
            ariaLabel="Close home board"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {tiles === null ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-role-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading the floor…
        </div>
      ) : error !== null && tiles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-role-caption text-text-danger">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : (
        <div
          ref={railRef}
          role="group"
          aria-label="Board tiles"
          onKeyDown={onRailKeyDown}
          className={cn(
            'flex min-h-0 flex-1 gap-3 p-3',
            // The rail: horizontal snap scroll, one tile per snap stop. When a
            // tile is expanded there is nothing to scroll past, so the rail
            // collapses to a single full-width column.
            expanded ? 'overflow-hidden' : 'snap-x snap-mandatory overflow-x-auto',
          )}
          data-board-rail
        >
          {visible.map((tile, index) => (
            <BoardTile
              key={tile.id}
              tile={tile}
              expanded={expanded === tile.id}
              focused={focused === index}
              ref={(el) => {
                tileRefs.current[index] = el;
              }}
              onFocus={() => setFocused(index)}
              onAsk={() => requestComposerSeed({ text: boardQuestionFor(tile), autoSend: false })}
              onToggleExpand={() => {
                setExpanded(expanded === tile.id ? null : tile.id);
                setFocused(0);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The sentence a tile hands the composer. The ROI tile's rows carry their own
 * questions (each gap knows what pulls its rows), so the tile-level question
 * is only the fallback for tiles whose rows do not.
 */
function boardQuestionFor(tile: BoardTilePayload): string {
  return `${tile.title} — show me the detail`;
}

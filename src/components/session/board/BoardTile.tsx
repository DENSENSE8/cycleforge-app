'use client';

/**
 * BoardTile — one column of the rail: a header, then its own vertical
 * scrollport of rows.
 *
 * Two scroll axes meet here, which is the whole reason this is a component and
 * not a div in the rail: the RAIL owns horizontal movement and the TILE owns
 * vertical, so the tile's list must be its own `overflow-y-auto` and must
 * `stopPropagation` on ↑/↓ or the rail's key handler would fight it.
 *
 * A row is a button when it carries its own question (the ROI gaps do — each
 * gap knows the sentence that pulls its rows) and plain text when it does not.
 * Nothing here writes; the only outbound action is seeding the composer.
 */

import { forwardRef } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { boardTileHeadline, boardTileRows, type BoardTilePayload } from './board-tiles';

/** One snap stop. Wide enough for a label plus a figure at 12px caption size. */
const TILE_WIDTH = 'w-[286px]';

export const BoardTile = forwardRef<HTMLElement, {
  tile: BoardTilePayload;
  expanded: boolean;
  focused: boolean;
  onFocus: () => void;
  onAsk: () => void;
  onToggleExpand: () => void;
}>(function BoardTile({ tile, expanded, focused, onFocus, onAsk, onToggleExpand }, ref) {
  const rows = boardTileRows(tile);
  const headline = boardTileHeadline(tile);

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      tabIndex={0}
      onFocus={onFocus}
      aria-label={tile.title}
      data-board-tile={tile.id}
      data-board-tile-focused={focused ? 'true' : undefined}
      className={cn(
        'flex min-h-0 flex-col rounded-lg border bg-surface-card outline-none',
        expanded ? 'w-full flex-1' : `shrink-0 snap-start ${TILE_WIDTH}`,
        focused ? 'border-border-emphasis' : 'border-border-soft',
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border-hairline px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-role-caption font-semibold text-text-default">{tile.title}</p>
          {headline ? (
            <p
              className={cn(
                'text-role-micro',
                tile.state === 'ok' ? 'text-text-muted' : 'text-text-warning',
              )}
            >
              {headline}
            </p>
          ) : null}
        </div>
        <IconButton
          icon={expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          onClick={onToggleExpand}
          ariaLabel={expanded ? `Collapse ${tile.title}` : `Expand ${tile.title}`}
          tone="neutral"
          className="shrink-0"
        />
      </header>

      {/*
        The tile's own scrollport. ↑/↓ are handled natively here and stopped
        from reaching the rail, so vertical inside a tile never becomes
        horizontal across tiles.
      */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.stopPropagation();
        }}
      >
        {tile.state === 'denied' ? (
          <p className="px-3 py-2 text-role-caption text-text-muted">
            You do not have permission to read this.
          </p>
        ) : tile.state === 'error' ? (
          <p className="px-3 py-2 text-role-caption text-text-danger">{tile.error ?? 'Unavailable.'}</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-2 text-role-caption text-text-muted">Nothing to show — this one is clear.</p>
        ) : (
          <ul>
            {rows.map((row, index) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-role-caption text-text-default">{row.label}</span>
                    {row.hint ? (
                      <span className="block truncate text-role-micro text-text-faint">{row.hint}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-role-caption tabular-nums text-text-muted">
                    {row.value}
                  </span>
                </>
              );
              return (
                <li key={`${row.label}-${index}`} className="border-b border-border-hairline last:border-b-0">
                  {row.question ? (
                    <button
                      type="button"
                      onClick={() => requestComposerSeed({ text: row.question ?? '', autoSend: false })}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-hover"
                      aria-label={row.question}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/*
        The tile-level ask. Rows that carry their own question stay raw list
        buttons — same recipe the artifact panel's history list uses, because a
        ledger row is not an ops CTA and 20 house Buttons in a scrollport read
        as a toolbar.
      */}
      <footer className="shrink-0 border-t border-border-hairline px-1 py-0.5">
        <Button variant="ghost" size="sm" onClick={onAsk} ariaLabel={`Ask about ${tile.title}`}>
          Ask about this tile
        </Button>
      </footer>
    </section>
  );
});

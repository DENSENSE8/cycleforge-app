'use client';

/** `DeskPageChrome` — the frame every **non-scan desk** wears. */

import { useEffect, useRef, type ReactNode } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import {
  DESK_SPLIT_SHORTCUT,
  DeskStageProvider,
  isDeskSplitChord,
  type DeskStageView,
} from './DeskStageContext';
import {
  DESK_CHROME_STAGE_BODY_CLASS,
  DESK_PAGE_HEADER_ROW_CLASS,
  DESK_STAGE_DETACH_CLASS,
  DESK_STAGE_FIXED_CLASS,
  DESK_STAGE_FULLSCREEN_CLASS,
  DESK_STAGE_GROUND_CLASS,
  DESK_STAGE_GUTTER_CLASS,
} from '../tokens/desk-stage';
import { cn } from '@/utils/_cn';

interface DeskPageChromeProps {
  /** Page title, top-left. */
  title: string;
  /** Rich title face (Shipping's hover-to-unfold view title); `title` stays the accessible name. */
  titleSlot?: ReactNode;
  /**
   * Optional line under the title — a count, a scope. Omit it when there is
   * nothing true to say; a placeholder subtitle is worse than none.
   */
  subtitle?: ReactNode;
  /**
   * Header action cluster, top-right (overall actions such as **Export**, then
   * the primary CTA). Composed by {@link useDeskActionSlotNode}. A node rather
   * than an `onAdd` callback so a desk can hand over whatever its intake needs.
   */
  addSlot?: ReactNode;
  /**
   * The header's middle, between the title and the actions — Shipping's key
   * strip (the next key to press; the `G` sequence while armed). Grows to
   * fill, so the title and the actions never move.
   */
  headerCenter?: ReactNode;
  /** The stage's ONE state — see {@link DeskStageView}. */
  view: DeskStageView;
  onViewChange: (view: DeskStageView) => void;
  /** The desk body — a grid, a board, a form host. Mounted inside the card. */
  children: ReactNode;
  className?: string;
}

export function DeskPageChrome({
  title,
  titleSlot,
  subtitle,
  addSlot,
  headerCenter,
  view,
  onViewChange,
  children,
  className,
}: DeskPageChromeProps) {
  const fullscreen = view !== 'in-place';
  const measure = fullscreen ? DESK_STAGE_FULLSCREEN_CLASS : DESK_STAGE_FIXED_CLASS;

  // Escape is the keyboard half of the one-click-out budget: one exit per
  // press — the record (DeskRecordPlane, document) and a check-set (window
  // capture) claim it first; then split.
  const viewRef = useRef({ split: view === 'split', onViewChange });
  viewRef.current = { split: view === 'split', onViewChange };
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      viewRef.current.onViewChange('in-place');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  // ⌘/Ctrl+Shift+S — In place ⇄ Split: a chord, so no scanner can type it and
  // it may fire from a text field; an open overlay still owns the keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isDeskSplitChord(event) || hasOpenOverlay()) return;
      event.preventDefault();
      const current = viewRef.current;
      current.onViewChange(current.split ? 'in-place' : 'split');
    };
    window.addEventListener('keydown', onKeyDown);
    const unregister = registerShortcutOverviewGroup({
      id: 'desk-split',
      title: 'Desk',
      rows: [{ keys: [...DESK_SPLIT_SHORTCUT.keys], label: DESK_SPLIT_SHORTCUT.label }],
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, []);

  return (
    <DeskStageProvider view={view} setView={onViewChange}>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          // Gutters wrap every row so they cannot drift apart.
          !fullscreen && DESK_STAGE_GUTTER_CLASS,
          !fullscreen && DESK_STAGE_GROUND_CLASS,
          !fullscreen && 'pt-2',
          className,
        )}
      >
        {/*
          The page header is page FURNITURE: it does not exist in fullscreen.
          Not hidden — unrendered, so the card's flex-basis is the whole canvas.
          There is no tab row: a desk's views live in the left contextual
          sidebar (owner 2026-09-28).
        */}
        {fullscreen ? null : (
            <div
              data-testid="desk-page-header"
              className={cn(
                'flex min-w-0 shrink-0 items-center justify-between gap-3',
                measure,
                DESK_PAGE_HEADER_ROW_CLASS,
                // A record that owns the work replaces the page-level title
                // and CTA so its Back + identity band is the topmost header.
                '[:root:has([data-record-presentation="allocate"])_&]:hidden',
                '[:root:has([data-record-presentation="fnsku"])_&]:hidden',
              )}
            >
              {/* A rich title face keeps its width (the middle slot flexes instead)
                  and truncates itself; `truncate` here would clip its hover bubble. */}
              <div className={cn('min-w-0', titleSlot && 'shrink-0')}>
                <h1
                  aria-label={titleSlot ? title : undefined}
                  className={cn('text-role-title text-text-default', titleSlot ? 'min-w-0' : 'truncate')}
                >
                  {titleSlot ?? title}
                </h1>
                {subtitle ? (
                  <p className="truncate text-role-caption text-text-soft">{subtitle}</p>
                ) : null}
              </div>
              {headerCenter}
              {/* Overall actions (Export) then the primary CTA. */}
              {addSlot}
            </div>
        )}

        {/* ── The card ────────────────────────────────────────────────────── */}
        <div
          data-testid="desk-page-stage"
          data-fullscreen={fullscreen ? '' : undefined}
          data-desk-view={view}
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            measure,
            fullscreen
              ? // Flush + square: a rounded card floating on a canvas it
                // completely fills is a corner radius with nothing behind it.
                'bg-surface-card'
              : cn(DESK_CHROME_STAGE_BODY_CLASS, DESK_STAGE_DETACH_CLASS),
          )}
        >
          {children}
        </div>
      </div>
    </DeskStageProvider>
  );
}


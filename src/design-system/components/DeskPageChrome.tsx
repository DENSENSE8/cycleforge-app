'use client';

/** `DeskPageChrome` — the frame every **non-scan desk** wears. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { cornerClass } from '../tokens/radius';
import { focusRing } from '../tokens/focus-ring';
import {
  DESK_FLOOR_SHORTCUT,
  DESK_SPLIT_SHORTCUT,
  DeskStageProvider,
  isDeskFloorChord,
  isDeskSplitChord,
  publishDeskFloorActive,
  type DeskStageView,
} from './DeskStageContext';
import {
  DESK_BAR_SEGMENT_CLASS,
  DeskHeaderFaceProvider,
  deskBarSegmentTone,
} from './DeskActionSlot';
import {
  DESK_CHROME_STAGE_BODY_CLASS,
  DESK_PAGE_HEADER_ROW_CLASS,
  DESK_STAGE_DETACH_CLASS,
  DESK_STAGE_FIXED_CLASS,
  DESK_STAGE_FULLSCREEN_CLASS,
  DESK_STAGE_GROUND_CLASS,
  DESK_STAGE_GUTTER_CLASS,
  DESK_TAB_ROW_CLASS,
} from '../tokens/desk-stage';
import { cn } from '@/utils/_cn';

export interface DeskPageTab {
  id: string;
  label: string;
  /** Rows behind the tab. Omit for honest absence — never print a fake 0. */
  count?: number;
  /** Optional glyph from the house catalog (adapter renders the node). */
  icon?: ReactNode;
}

interface DeskPageChromeProps {
  /** Page title, top-left. */
  title: string;
  /**
   * Optional line under the title — a count, a scope. Omit it when there is
   * nothing true to say; a placeholder subtitle is worse than none.
   */
  subtitle?: ReactNode;
  /** Desk modes, left to right. */
  tabs: readonly DeskPageTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /**
   * Header action cluster, top-right (overall actions such as **Export**, then
   * the primary CTA). Composed by {@link useDeskActionSlotNode}. A node rather
   * than an `onAdd` callback so a desk can hand over whatever its intake needs.
   */
  addSlot?: ReactNode;
  /** A control at the START of the tab row, on the SAME axis as the tabs. */
  tabsLead?: ReactNode;
  /** The stage's ONE state — see {@link DeskStageView}. */
  view: DeskStageView;
  onViewChange: (view: DeskStageView) => void;
  /** Enter floor, or leave it for the view it was entered from. */
  onToggleFloor: () => void;
  /**
   * `'card'` (default):
   * `'flush'`: an industrial desk (BRIEF §4) — the desktop terminal's frame.
   */
  stage?: 'card' | 'flush';
  /** The desk body — a grid, a board, a form host. Mounted inside the card. */
  children: ReactNode;
  className?: string;
}

export function DeskPageChrome({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  addSlot,
  tabsLead,
  view,
  onViewChange,
  onToggleFloor,
  stage = 'card',
  children,
  className,
}: DeskPageChromeProps) {
  const fullscreen = view !== 'in-place';
  const floor = view === 'floor';
  const flush = stage === 'flush' && !fullscreen;
  const measure = fullscreen || flush ? DESK_STAGE_FULLSCREEN_CLASS : DESK_STAGE_FIXED_CLASS;

  // Lists that can paint the floor face register while mounted.
  const [floorFaces, setFloorFaces] = useState(0);
  const registerFloorFace = useCallback(() => {
    setFloorFaces((n) => n + 1);
    return () => setFloorFaces((n) => n - 1);
  }, []);
  const floorAvailable = floorFaces > 0;

  // Escape is the keyboard half of the one-click-out budget: one exit per
  // press — the record (DeskRecordPlane, document) and a check-set (window
  // capture) claim it first; then floor → the view it came from; then split.
  const viewRef = useRef({ floor, split: view === 'split', onViewChange, onToggleFloor });
  viewRef.current = { floor, split: view === 'split', onViewChange, onToggleFloor };
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      const current = viewRef.current;
      if (current.floor) current.onToggleFloor();
      else current.onViewChange('in-place');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  // ⌘/Ctrl+Shift+F — a chord, so no scanner can type it and it may fire from
  // a text field; an open overlay still owns the keyboard.
  useEffect(() => {
    if (!floorAvailable) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isDeskFloorChord(event) || hasOpenOverlay()) return;
      event.preventDefault();
      viewRef.current.onToggleFloor();
    };
    window.addEventListener('keydown', onKeyDown);
    const unregister = registerShortcutOverviewGroup({
      id: 'desk-floor',
      title: 'Desk',
      rows: [{ keys: [...DESK_FLOOR_SHORTCUT.keys], label: DESK_FLOOR_SHORTCUT.label }],
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, [floorAvailable]);

  // The sidebar column and the route's mode region live above this stage.
  useEffect(() => {
    publishDeskFloorActive(floor);
    return () => publishDeskFloorActive(false);
  }, [floor]);

  // A floor whose list face left (the desk switched lists) is no floor.
  useEffect(() => {
    if (floor && !floorAvailable) viewRef.current.onToggleFloor();
  }, [floor, floorAvailable]);

  // ⌘/Ctrl+Shift+S — In place ⇄ Split, beside the Floor chord (same law: a
  // chord, may fire from a text field, an open overlay still owns the keys).
  // Floor's records always open in place, so the key rests there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isDeskSplitChord(event) || hasOpenOverlay()) return;
      const current = viewRef.current;
      if (current.floor) return;
      event.preventDefault();
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
    <DeskStageProvider
      view={view}
      setView={onViewChange}
      toggleFloor={onToggleFloor}
      floorAvailable={floorAvailable}
      registerFloorFace={registerFloorFace}
    >
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          // Gutters wrap every row so they cannot drift apart. A flush stage
          // moves the gutter onto the header + tab rows (below) instead.
          !fullscreen && !flush && DESK_STAGE_GUTTER_CLASS,
          !fullscreen && (flush ? 'bg-mode-canvas' : DESK_STAGE_GROUND_CLASS),
          !fullscreen && !flush && 'pt-2',
          className,
        )}
      >
        {/*
          Page header and tab row are page FURNITURE: they do not exist in
          fullscreen. Not hidden — unrendered, so the card's flex-basis is the
          whole canvas rather than the canvas minus two invisible rows.
        */}
        {fullscreen ? null : flush ? (
          <DeskIndustrialBar
            title={title}
            subtitle={subtitle}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
            addSlot={addSlot}
            tabsLead={tabsLead}
          />
        ) : (
          <>
            {/* ── Page header — title left, CTA right ────────────────────── */}
            <div
              data-testid="desk-page-header"
              className={cn(
                'flex min-w-0 shrink-0 items-center justify-between gap-3',
                measure,
                DESK_PAGE_HEADER_ROW_CLASS,
              )}
            >
              <div className="min-w-0">
                <h1 className="truncate text-role-title text-text-default">{title}</h1>
                {subtitle ? (
                  <p className="truncate text-role-caption text-text-soft">{subtitle}</p>
                ) : null}
              </div>
              {/* Overall actions (Export) then the primary CTA. */}
              {addSlot}
            </div>

            {/* ── Tab row — tabs (+ same-axis overflow), underline selection ── */}
            {tabs.length === 0 && !tabsLead ? null : (
            <div
              data-testid="desk-page-chrome-band"
              className={cn(
                'flex min-w-0 shrink-0 items-stretch',
                measure,
                DESK_TAB_ROW_CLASS,
              )}
            >
              {/*
 * Every tab keeps `px-3` — padding lives INSIDE the name, so the active underline (the hit box's `border-b`) has air on both sides of the…
 * hairline (operator 2026-08-31).
 */}
              {/* Same-axis overflow, abutting the tablist with no gap — it reads as the head of the tab vocabulary rather than a control beside it. */}
              {tabsLead}
              <div
                role="tablist"
                className="flex min-w-0 flex-1 items-stretch gap-1"
              >
                {tabs.map((tab) => {
                  const active = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onTabChange(tab.id)}
                      data-testid={`desk-tab-${tab.id}`}
                      data-active={active ? '' : undefined}
                      className={cn(
                        'ds-raw-button inline-flex shrink-0 items-center gap-1 px-3 text-role-caption',
                        /* Selection IS the rule, not a bar above it. */
                        '-mb-px border-b',
                        // Colour only. A tab that slid or grew would move its neighbours, which ops chrome forbids (AGENTS.md) — every tab carries the border,…
                        'transition-colors duration-100 ease-out',
                        cornerClass('flush'),
                        focusRing('control'),
                        active
                          ? 'border-text-default font-semibold text-text-default'
                          : 'border-transparent text-text-muted hover:text-text-default',
                      )}
                    >
                      {tab.icon}
                      <span className="truncate">{tab.label}</span>
                      {typeof tab.count === 'number' ? (
                        <span
                          className={cn(
                            'tabular-nums text-role-micro',
                            active ? 'text-text-soft' : 'text-text-faint',
                          )}
                        >
                          {tab.count > 99 ? '99+' : tab.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            )}
          </>
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
              : flush
                ? 'bg-mode-canvas'
                : cn(DESK_CHROME_STAGE_BODY_CLASS, DESK_STAGE_DETACH_CLASS),
          )}
        >
          {children}
        </div>
      </div>
    </DeskStageProvider>
  );
}

/**
 * The industrial desk bar (`stage="flush"`) — the desktop terminal's `.header-routes`:
 * between neighbours, pressed = ink fill (owner 2026-09-24).
 */
function DeskIndustrialBar({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  addSlot,
  tabsLead,
}: Pick<
  DeskPageChromeProps,
  'title' | 'subtitle' | 'tabs' | 'activeTab' | 'onTabChange' | 'addSlot' | 'tabsLead'
>) {
  return (
    <div
      data-testid="desk-page-chrome-band"
      className="flex min-h-11 w-full min-w-0 shrink-0 items-stretch border-b-2 border-mode-ink bg-mode-bar"
    >
      <h1 className="sr-only">{title}</h1>
      {tabsLead}
      <div role="tablist" aria-label={title} className="flex min-w-0 items-stretch">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              data-testid={`desk-tab-${tab.id}`}
              data-active={active ? '' : undefined}
              className={cn(
                DESK_BAR_SEGMENT_CLASS,
                'border-r border-mode-edge',
                deskBarSegmentTone(active),
              )}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              {typeof tab.count === 'number' ? (
                <span className="tabular-nums">{tab.count > 99 ? '99+' : tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {subtitle ? (
        <span className="flex min-w-0 items-center truncate px-4 text-role-caption text-mode-muted">
          {subtitle}
        </span>
      ) : null}
      <div
        data-testid="desk-page-header"
        className="ml-auto flex min-w-0 items-stretch"
      >
        <DeskHeaderFaceProvider face="segment">{addSlot}</DeskHeaderFaceProvider>
      </div>
    </div>
  );
}


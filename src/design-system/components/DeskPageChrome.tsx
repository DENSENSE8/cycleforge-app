'use client';

/** `DeskPageChrome` — the frame every **non-scan desk** wears. */

import { useEffect, type ReactNode } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cornerClass } from '../tokens/radius';
import { focusRing } from '../tokens/focus-ring';
import { DeskStageProvider } from './DeskStageContext';
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
  DESK_STAGE_FLOOR_CLASS,
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
  fullscreen: boolean;
  onToggleFullscreen: () => void;
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
  fullscreen,
  onToggleFullscreen,
  stage = 'card',
  children,
  className,
}: DeskPageChromeProps) {
  const flush = stage === 'flush' && !fullscreen;
  const measure = fullscreen || flush ? DESK_STAGE_FULLSCREEN_CLASS : DESK_STAGE_FIXED_CLASS;

  // Escape is the keyboard half of the one-click-out budget.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      onToggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, onToggleFullscreen]);

  return (
    <DeskStageProvider fullscreen={fullscreen} toggleFullscreen={onToggleFullscreen}>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          // Gutters wrap every row so they cannot drift apart. A flush stage
          // moves the gutter onto the header + tab rows (below) instead.
          !fullscreen && !flush && DESK_STAGE_GUTTER_CLASS,
          !fullscreen && (flush ? 'bg-mode-canvas' : DESK_STAGE_GROUND_CLASS),
          !fullscreen && !flush && 'pt-2',
          !fullscreen && !flush && DESK_STAGE_FLOOR_CLASS,
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


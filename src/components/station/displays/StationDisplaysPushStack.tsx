'use client';

/**
 * Station Displays — right-edge **push** column SoT (Unbox golden · Arrival ·
 * Testing · Pack · Shipping · Review).
 *
 * **Action Plane host** (Station Action vs Context planes): every scan station
 * mounts this stack. Leaf densify / keyboard grammar lives in
 * {@link StationActionDossierShell} · {@link StationDenseFactStrip} ·
 * {@link StationActionKeyLegend} — builders only register leaves. Esc / Back
 * stay here; leaf legends must not bind Escape. On leaf open, focus restores
 * into `[data-station-action-dossier]` when present.
 *
 * Navigation is Root-to-Leaf drill-down — ONE grammar, no mode prop:
 *   - `activeTab === 'index'` → grouped status / topic rows
 *   - leaf id → sticky Back + full-height body (no horizontal icon plate)
 *   - Esc pops leaf → index → close; Back → index
 *
 * A `navMode="leaf"` variant existed for one day (2026-08-07). It rendered a
 * single leaf and NO switcher — `onTabChange` had no caller inside the column —
 * so Pack (4 displays) · Shipping (2) · Review (3) shipped with every display
 * but the one the edge toggle guessed unreachable from anywhere in the app. It
 * was removed rather than kept for a hypothetical one-display station: an
 * untested branch in a shared waist is where the next regression hides, and a
 * one-display station is already served by a contextual `openDisplays(<leaf>)`
 * that skips the index (Arrival · Pairing).
 *
 * Footer (left-rail twin): {@link TechRailSearchBar} filters the Root Index;
 * `→|` Hide right panel seats in the search trailing track.
 *
 * Host body uses {@link DISPLAYS_FLUSH_HOST} (`px-0`) — the column IS the card.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SectionTab } from '@/design-system/components';
import { DISPLAYS_FLUSH_HOST } from '@/design-system/shells/detail-stack';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';
import {
  STATION_DISPLAY_INDEX,
  deriveDisplayIndexRowsFromTabs,
  filterDisplayIndexRows,
  type DisplayIndexRow,
} from './display-index';
import { StationDisplayIndexList } from './StationDisplayIndexList';
import { StationDisplayLeafHeader } from './StationDisplayLeafHeader';
import { StationDisplaysPushColumn } from './StationDisplaysPushColumn';

const DISPLAYS_PUSH_STORAGE_KEY = 'unbox-displays-push-width';

function tabLabel(tabs: SectionTab[], id: string): string {
  return tabs.find((t) => t.id === id)?.label ?? id;
}

export function StationDisplaysPushStack({
  tabs,
  activeTab,
  onTabChange,
  onClose,
  headerTrailing = null,
  rightSlot = null,
  indexRows,
  // Defaults match Unbox so that call site stays thin; siblings pass their own
  // storage key / aria / testids so prefs don't collide.
  ariaLabel = 'Unbox displays',
  storageKey = DISPLAYS_PUSH_STORAGE_KEY,
  testId = 'receiving-displays-push',
  resizeLabel = 'Resize displays panel',
  resizeTestId = 'unbox-displays-push-resize',
  resizeTooltip = 'Resize displays',
}: {
  tabs: SectionTab[];
  /** `index` = Root Index; otherwise a leaf tab id from {@link tabs}. */
  activeTab: string;
  onTabChange: (id: string) => void;
  onClose: () => void;
  /** Carton ↑↓ at the details panel top-right while Displays is open. */
  headerTrailing?: ReactNode;
  /**
   * Procedure progress ring — column top band (right of fullscreen, left of
   * carton cursor). Optional; stations without a derived procedure leave it empty.
   */
  rightSlot?: ReactNode;
  /**
   * Enriched Root Index rows (subtitle + tone + group). When omitted, rows are
   * derived from visible {@link tabs} (neutral tone + default groups).
   */
  indexRows?: DisplayIndexRow[];
  ariaLabel?: string;
  storageKey?: string;
  testId?: string;
  resizeLabel?: string;
  resizeTestId?: string;
  resizeTooltip?: string;
}) {
  const onIndex = activeTab === STATION_DISPLAY_INDEX;
  const [filterQuery, setFilterQuery] = useState('');
  /** Last leaf visited — paints layout-stable active glow on Root Index return. */
  const [lastLeafId, setLastLeafId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== STATION_DISPLAY_INDEX) setLastLeafId(activeTab);
  }, [activeTab]);

  // Action Plane: when a leaf mounts a dossier shell, land keyboard focus on
  // its roving row (not the Back control). Leaves without the shell are unchanged.
  useEffect(() => {
    if (activeTab === STATION_DISPLAY_INDEX) return;
    const id = window.requestAnimationFrame(() => {
      const dossier = document.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-station-action-dossier]`,
      );
      if (!dossier) return;
      const row = dossier.querySelector<HTMLElement>('button[tabindex="0"]');
      row?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeTab, testId]);

  const resolvedIndexRows = useMemo(
    () => indexRows ?? deriveDisplayIndexRowsFromTabs(tabs),
    [indexRows, tabs],
  );

  const filteredIndexRows = useMemo(
    () => filterDisplayIndexRows(resolvedIndexRows, filterQuery),
    [resolvedIndexRows, filterQuery],
  );

  const activeLeafTab = useMemo(() => {
    if (onIndex) return null;
    return tabs.find((t) => t.id === activeTab) ?? null;
  }, [onIndex, tabs, activeTab]);

  const goIndex = useCallback(() => onTabChange(STATION_DISPLAY_INDEX), [onTabChange]);

  /** Esc pops one level: leaf → index → close. */
  const onEscape = useCallback(() => {
    if (onIndex) onClose();
    else goIndex();
  }, [onIndex, onClose, goIndex]);

  const onFilterChange = useCallback(
    (next: string) => {
      setFilterQuery(next);
      // Typing in a leaf pops to the filtered index (index nav only).
      if (!onIndex && next.trim()) goIndex();
    },
    [onIndex, goIndex],
  );

  return (
    <StationDisplaysPushColumn
      ariaLabel={ariaLabel}
      testId={testId}
      storageKey={storageKey}
      resizeLabel={resizeLabel}
      resizeTestId={resizeTestId}
      resizeTooltip={resizeTooltip}
      onClose={onClose}
      onEscape={onEscape}
      headerTrailing={headerTrailing}
      headerRightSlot={rightSlot}
      footer={
        <div data-testid="unbox-displays-footer" className="shrink-0">
          <TechRailSearchBar
            value={filterQuery}
            onChange={onFilterChange}
            onClear={() => setFilterQuery('')}
            placeholder="Filter displays…"
            density="row"
            variant="rail"
            trailingAction={
              <StationDisplaysEdgeToggle variant="column-close" onClick={onClose} />
            }
          />
        </div>
      }
    >
      <div className={DISPLAYS_FLUSH_HOST}>
        {onIndex ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <StationDisplayIndexList
              rows={filteredIndexRows}
              tabs={tabs}
              onSelect={onTabChange}
              activeId={lastLeafId}
              filterQuery={filterQuery}
              onClearFilter={() => setFilterQuery('')}
            />
          </div>
        ) : (
          <div
            className="flex h-full min-h-0 flex-col"
            data-testid="unbox-displays-leaf"
            data-station-displays-leaf={activeTab}
          >
            <StationDisplayLeafHeader
              title={tabLabel(tabs, activeTab)}
              onBack={goIndex}
            />
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              data-station-displays-leaf-body=""
            >
              {activeLeafTab?.content ?? null}
            </div>
          </div>
        )}
      </div>
    </StationDisplaysPushColumn>
  );
}

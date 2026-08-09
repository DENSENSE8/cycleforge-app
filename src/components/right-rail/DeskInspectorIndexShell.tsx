'use client';

/**
 * Desk Context-plane inspector — Unbox rows index → leaf grammar on
 * {@link RightRailHost}. Composes Station DisplayIndexRow + list + leaf header
 * primitives; never mounts {@link StationDisplaysPushStack}.
 *
 * Chrome (→| · ↑↓) stays on {@link DeskRailChromeRow} above this shell.
 * Esc pops leaf → index (does not park the rail — Band 3 / chrome owns that).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SectionTab } from '@/design-system/components';
import { DISPLAYS_FLUSH_HOST } from '@/design-system/shells/detail-stack/layout';
import {
  STATION_DISPLAY_INDEX,
  defaultDisplayIndexGroup,
  type DisplayIndexGroup,
  type DisplayIndexRow,
  type DisplayIndexTone,
} from '@/components/station/displays/display-index';
import { StationDisplayIndexList } from '@/components/station/displays/StationDisplayIndexList';
import { StationDisplayLeafHeader } from '@/components/station/displays/StationDisplayLeafHeader';
import { cn } from '@/utils/_cn';

export const DESK_INSPECTOR_INDEX = STATION_DISPLAY_INDEX;

export type DeskInspectorLeaf = {
  id: string;
  label: string;
  subtitle?: string;
  tone?: DisplayIndexTone;
  group?: DisplayIndexGroup;
  /** Glyph for the index list; falls back to a blank mark when omitted. */
  icon?: SectionTab['icon'];
  content: ReactNode;
};

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function leafToIndexRow(leaf: DeskInspectorLeaf): DisplayIndexRow {
  return {
    id: leaf.id,
    label: leaf.label,
    subtitle: leaf.subtitle ?? '',
    tone: leaf.tone ?? 'neutral',
    group: leaf.group ?? defaultDisplayIndexGroup(leaf.id),
  };
}

function BlankLeafIcon({ className }: { className?: string }) {
  return <span className={className} aria-hidden />;
}

function leafToSectionTab(leaf: DeskInspectorLeaf): SectionTab {
  return {
    id: leaf.id,
    label: leaf.label,
    icon: leaf.icon ?? BlankLeafIcon,
    content: null,
  };
}

export function DeskInspectorIndexShell({
  leaves,
  activeId: activeIdProp,
  onActiveIdChange,
  /**
   * Initial stage when uncontrolled. Pass a leaf id to open that leaf first
   * (stub peeks); omit / `'index'` for Root Index (Orders golden).
   */
  defaultActiveId = DESK_INSPECTOR_INDEX,
  indexRows,
  indexRightSlot = null,
  leafTrailing = null,
  ariaLabel = 'Inspector topics',
  testId = 'desk-inspector-index',
  backLabel = 'Back to topics',
  className,
}: {
  leaves: readonly DeskInspectorLeaf[];
  activeId?: string;
  onActiveIdChange?: (id: string) => void;
  defaultActiveId?: string;
  /** Enriched rows; defaults from {@link leaves}. */
  indexRows?: DisplayIndexRow[];
  /** Index-only trailing (e.g. Orders ⋮ handoffs) — peer of Unbox index chrome. */
  indexRightSlot?: ReactNode;
  leafTrailing?: ReactNode;
  ariaLabel?: string;
  testId?: string;
  backLabel?: string;
  className?: string;
}) {
  const [uncontrolledId, setUncontrolledId] = useState(defaultActiveId);
  const activeId = activeIdProp ?? uncontrolledId;
  const setActiveId = useCallback(
    (id: string) => {
      onActiveIdChange?.(id);
      if (activeIdProp === undefined) setUncontrolledId(id);
    },
    [activeIdProp, onActiveIdChange],
  );

  const onIndex = activeId === DESK_INSPECTOR_INDEX;
  const [lastLeafId, setLastLeafId] = useState<string | null>(null);

  useEffect(() => {
    if (!onIndex) setLastLeafId(activeId);
  }, [activeId, onIndex]);

  const resolvedLeaves = useMemo(
    () => leaves.filter((l) => Boolean(l.id) && Boolean(l.label)),
    [leaves],
  );

  const tabs = useMemo(
    () => resolvedLeaves.map(leafToSectionTab),
    [resolvedLeaves],
  );

  const resolvedIndexRows = useMemo(
    () => indexRows ?? resolvedLeaves.map(leafToIndexRow),
    [indexRows, resolvedLeaves],
  );

  const activeLeaf = useMemo(
    () => (onIndex ? null : resolvedLeaves.find((l) => l.id === activeId) ?? null),
    [onIndex, resolvedLeaves, activeId],
  );

  const goIndex = useCallback(() => setActiveId(DESK_INSPECTOR_INDEX), [setActiveId]);

  // Esc: leaf → index. Never parks the rail (desk chrome / Band 3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEditableKeyTarget(e.target)) return;
      if (onIndex) return;
      e.preventDefault();
      e.stopPropagation();
      goIndex();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [goIndex, onIndex]);

  // Gated-away / missing leaf → index (never silent swap to leaves[0]).
  useEffect(() => {
    if (onIndex) return;
    if (activeLeaf) return;
    setActiveId(DESK_INSPECTOR_INDEX);
  }, [activeLeaf, onIndex, setActiveId]);

  return (
    <div
      className={cn(DISPLAYS_FLUSH_HOST, 'flex min-h-0 flex-1 flex-col', className)}
      data-testid={testId}
      data-desk-inspector-index=""
      data-desk-inspector-stage={onIndex ? 'index' : 'leaf'}
      aria-label={ariaLabel}
    >
      {onIndex ? (
        <>
          {indexRightSlot != null ? (
            <div
              className="flex shrink-0 items-center justify-end gap-1 border-b border-border-hairline px-2 py-1"
              data-desk-inspector-index-trailing=""
            >
              {indexRightSlot}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
            <StationDisplayIndexList
              rows={resolvedIndexRows}
              tabs={tabs}
              onSelect={setActiveId}
              activeId={lastLeafId}
            />
          </div>
        </>
      ) : activeLeaf ? (
        <>
          <StationDisplayLeafHeader
            title={activeLeaf.label}
            onBack={goIndex}
            backLabel={backLabel}
            canGoBack
            canGoForward={false}
            trailing={leafTrailing}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeLeaf.content}
          </div>
        </>
      ) : null}
    </div>
  );
}

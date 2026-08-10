'use client';

/**
 * Desk Context-plane inspector — thin adapter over Unbox
 * {@link DisplaysIndexLeafStage}. Upgrade the stage / index list / leaf header
 * in `station/displays/` — this shell only maps leaves ↔ stage + Esc pop.
 *
 * Never mounts {@link StationDisplaysPushStack} (Action push column). Chrome
 * (→| · ↑↓) stays on {@link DeskRailChromeRow} above this shell.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SectionTab } from '@/design-system/components';
import {
  STATION_DISPLAY_INDEX,
  defaultDisplayIndexGroup,
  type DisplayIndexGroup,
  type DisplayIndexRow,
  type DisplayIndexTone,
} from '@/components/station/displays/display-index';
import { DisplaysIndexLeafStage } from '@/components/station/displays';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
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
  /** Index-only trailing (e.g. Orders ⋮ handoffs). */
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

  const stickyHeader = onIndex
    ? indexRightSlot != null ? (
        <div
          className="flex shrink-0 items-center justify-end gap-1 border-b border-border-hairline px-2 py-1"
          data-desk-inspector-index-trailing=""
        >
          {indexRightSlot}
        </div>
      ) : null
    : (
        <StationDisplayLeafHeader
          title={activeLeaf?.label ?? ''}
          onBack={goIndex}
          backLabel={backLabel}
          canGoBack
          canGoForward={false}
          trailing={leafTrailing}
        />
      );

  return (
    <div
      data-testid={testId}
      data-desk-inspector-index=""
      aria-label={ariaLabel}
      className={cn('flex min-h-0 flex-1 flex-col', className)}
    >
      <DisplaysIndexLeafStage
        onIndex={onIndex}
        stickyHeader={stickyHeader}
        rows={resolvedIndexRows}
        tabs={tabs}
        onSelectLeaf={setActiveId}
        lastLeafId={lastLeafId}
        leafId={activeLeaf?.id}
        leafTestId="desk-inspector-leaf"
        leafBody={activeLeaf?.content ?? null}
      />
    </div>
  );
}

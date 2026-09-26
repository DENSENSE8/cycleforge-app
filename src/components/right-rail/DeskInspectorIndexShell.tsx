'use client';

/** Desk Context-plane inspector — thin adapter over Unbox {@link DisplaysIndexLeafStage}. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SectionTab } from '@/design-system/components';
import {
  STATION_DISPLAY_INDEX,
  defaultDisplayIndexGroup,
  filterDisplayIndexRows,
  type DisplayIndexGroup,
  type DisplayIndexRow,
  type DisplayIndexTone,
} from '@/components/station/displays/display-index';
import {
  DisplaysIndexLeafStage,
  type StationDisplayIndexFilterKeys,
} from '@/components/station/displays/DisplaysIndexLeafStage';
import { STATION_DISPLAYS_PUSH_TOP_BAND } from '@/components/station/entity-context/station-identity-chrome';
import { RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS } from '@/components/right-rail/DeskRailChromeRow';
import { SearchField } from '@/design-system/primitives/SearchField';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { useDeskRecordPlaneOptional } from '@/design-system/components/DeskRecordPlane';
import { StationDisplayLeafHeader } from '@/components/station/displays/StationDisplayLeafHeader';
import { cn } from '@/utils/_cn';

export const DESK_INSPECTOR_INDEX = STATION_DISPLAY_INDEX;

/** Stable identity so `stance='standalone'` never re-renders on a fresh []. */
const EMPTY_LEAVES: readonly DeskInspectorLeaf[] = Object.freeze([]);

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
  stance,
  body = null,
  leaves = EMPTY_LEAVES,
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
  chrome = null,
  headerRightSlot = null,
  title,
  ariaLabel = 'Inspector topics',
  testId = 'desk-inspector-index',
  backLabel = 'Back to topics',
  /** Unbox Root Index find (`Filter displays…`). Daily opts in; Repair/History stay off. */
  indexFilter = false,
  className,
}: {
  /** REQUIRED, no default — the enforcement hinge. */
  stance: 'index' | 'standalone';
  /** `stance='standalone'` only — the panel body under the band. */
  body?: ReactNode;
  /** `stance='index'` only. */
  leaves?: readonly DeskInspectorLeaf[];
  /** Band title. Required for `standalone`; `index` derives it from the leaf. */
  title?: string;
  /**
   * Read-only metric on the band — elapsed, progress ring.
   * NEVER a verb: verbs crowd the two window controls off the flush corner.
   */
  headerRightSlot?: ReactNode;
  activeId?: string;
  onActiveIdChange?: (id: string) => void;
  defaultActiveId?: string;
  /** Enriched rows; defaults from {@link leaves}. */
  indexRows?: DisplayIndexRow[];
  /** Index-only trailing (e.g. Orders ⋮ handoffs). */
  indexRightSlot?: ReactNode;
  leafTrailing?: ReactNode;
  /** Panel chrome that belongs on the SAME row as back + title — contextual icons. */
  /** @deprecated Use {@link headerRightSlot}. Kept so the 13 existing callers compile. */
  chrome?: ReactNode;
  ariaLabel?: string;
  testId?: string;
  backLabel?: string;
  indexFilter?: boolean;
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

  const [filterQuery, setFilterQuery] = useState('');
  const applyFilterQuery = useCallback(
    (next: string) => {
      setFilterQuery(next);
      if (!onIndex && next.trim()) setActiveId(DESK_INSPECTOR_INDEX);
    },
    [onIndex, setActiveId],
  );
  const indexFilterKeysRef = useRef<StationDisplayIndexFilterKeys | null>(null);

  const filteredIndexRows = useMemo(
    () =>
      indexFilter
        ? filterDisplayIndexRows(resolvedIndexRows, filterQuery)
        : resolvedIndexRows,
    [indexFilter, resolvedIndexRows, filterQuery],
  );

  const activeLeaf = useMemo(
    () => (onIndex ? null : resolvedLeaves.find((l) => l.id === activeId) ?? null),
    [onIndex, resolvedLeaves, activeId],
  );

  const goIndex = useCallback(() => setActiveId(DESK_INSPECTOR_INDEX), [setActiveId]);

  // Esc: leaf → index. Never parks the rail (desk chrome / Band 3). Inside a
  // DeskRecordPlane the plane owns Escape (first press closes the record); the
  // Back chevron still returns to the index.
  const inRecordPlane = useDeskRecordPlaneOptional() != null;
  useEffect(() => {
    if (inRecordPlane) return;
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
  }, [goIndex, onIndex, inRecordPlane]);

  // Gated-away / missing leaf → index (never silent swap to leaves[0]).
  useEffect(() => {
    if (onIndex) return;
    if (activeLeaf) return;
    setActiveId(DESK_INSPECTOR_INDEX);
  }, [activeLeaf, onIndex, setActiveId]);

  const indexFind =
    onIndex && indexFilter ? (
      <div
        data-testid="unbox-displays-filter-row"
        className="shrink-0 border-b border-border-hairline"
      >
        {/* The index's ↑↓/Enter/Esc nav belongs to the ROW that hosts the
            field, not to the field: a text input owns text. */}
        <div className="flex min-w-0 flex-1 items-center" onKeyDown={(e) => indexFilterKeysRef.current?.onFilterKeyDown(e)}>
          <SearchField
            value={filterQuery}
            onChange={applyFilterQuery}
            onClear={() => applyFilterQuery('')}
            placeholder="Filter displays…"
            className="min-w-0 flex-1"
          />
        </div>
      </div>
    ) : null;

  /** ONE band, both stages — the Displays-column contract. */
  const standalone = stance === 'standalone';
  const bandTitle = standalone
    ? (title ?? ariaLabel)
    : onIndex
      ? (title ?? ariaLabel)
      : (activeLeaf?.label ?? '');
  const stickyHeader = (
    <>
      <div className={STATION_DISPLAYS_PUSH_TOP_BAND} data-desk-inspector-leaf-band="">
        <StationDisplayLeafHeader
          title={bandTitle}
          onBack={goIndex}
          backLabel={backLabel}
          // Standalone owes no Back — there is no index above it to return to.
          canGoBack={!standalone && !onIndex}
          canGoForward={false}
          trailing={
            <>
              {standalone ? null : onIndex ? indexRightSlot : leafTrailing}
              {headerRightSlot ?? chrome}
            </>
          }
        />
        <span
          className={RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS}
          aria-hidden
          data-right-rail-host-close-slot
        />
      </div>
      {indexFind}
    </>
  );

  return (
    <div
      data-testid={testId}
      data-desk-inspector-index=""
      aria-label={ariaLabel}
      className={cn('flex min-h-0 flex-1 flex-col', className)}
    >
      {standalone ? (
        <>
          {stickyHeader}
          <div className="min-h-0 flex-1 overflow-y-auto" data-desk-inspector-body="">
            {body}
          </div>
        </>
      ) : (
      <DisplaysIndexLeafStage
        onIndex={onIndex}
        stickyHeader={stickyHeader}
        rows={filteredIndexRows}
        tabs={tabs}
        onSelectLeaf={setActiveId}
        lastLeafId={lastLeafId}
        filterQuery={indexFilter ? filterQuery : undefined}
        onClearFilter={indexFilter ? () => applyFilterQuery('') : undefined}
        indexFilterKeysRef={indexFilter ? indexFilterKeysRef : undefined}
        leafId={activeLeaf?.id}
        leafTestId="desk-inspector-leaf"
        leafBody={activeLeaf?.content ?? null}
      />
      )}
    </div>
  );
}

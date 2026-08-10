'use client';

/**
 * Products Labels workbench chrome — five-row Sheets flush stack:
 *   Band 1 — Products · Recent · History tabs (no search).
 *   Band 3 — {@link WorkbenchTriageBand}: catalog / history find (only on the
 *            tabs that have one — Recent is honest absence).
 * Mirrors UnboxWorkspaceHeader / OutboundWorkspaceHeader (find on Band 3).
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed process tabs
 * for every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · no page Views
 * yet (honest absence; if added they mount on Band 3, never Band-1 leading) ·
 * page-pin in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useMemo, type Ref } from 'react';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { SearchField } from '@/design-system/primitives/SearchField';
import {
  LABELS_PRODUCTS_TAB_LABEL,
  type LabelsSubView,
} from '@/components/labels/labels-view';

const TABS: LabelsSubView[] = ['print', 'recent', 'history'];

interface LabelsProductsWorkspaceHeaderProps {
  tab: LabelsSubView;
  onSelectTab: (tab: LabelsSubView) => void;
  search: string;
  onSearch: (value: string) => void;
  /** History tab: Enter / scanner submit resolves a unit lookup. */
  onHistorySubmit?: (raw: string) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function LabelsProductsWorkspaceHeader({
  tab,
  onSelectTab,
  search,
  onSearch,
  onHistorySubmit,
  controlsSlotRef,
  className,
}: LabelsProductsWorkspaceHeaderProps) {
  const tabs = useMemo(
    () =>
      TABS.map((id) => ({
        id,
        label: LABELS_PRODUCTS_TAB_LABEL[id],
        color: (id === 'print' ? 'blue' : id === 'recent' ? 'emerald' : 'purple') as
          | 'blue'
          | 'emerald'
          | 'purple',
        dividerBefore: id === 'recent',
      })),
    [],
  );

  const isHistory = tab === 'history';
  const isProducts = tab === 'print';

  const searchField = isHistory ? (
    <SearchField
      value={search}
      onChange={onSearch}
      onClear={() => onSearch('')}
      onSearch={(raw) => {
        const value = raw.trim();
        if (!value) return;
        onHistorySubmit?.(value);
        onSearch('');
      }}
      placeholder="Scan or paste a DataMatrix…"
      tone="blue"
      size="compact"
      className="min-w-0 flex-1"
    />
  ) : isProducts ? (
    <TechRailSearchBar
      variant="chrome"
      value={search}
      onChange={onSearch}
      placeholder="Filter SKU, title…"
      className="min-w-0 flex-1"
    />
  ) : null;

  return (
    <>
      <WorkbenchChromeHeader
        density="band"
        tabs={tabs}
        activeTab={tab}
        onTabChange={(id) => onSelectTab(id as LabelsSubView)}
        solidTone="accent"
        className={className}
      />
      {/*
        Band 3 — find lives here, not on Band 1. Only the tabs that have a find
        render it (Products filter · History DataMatrix scan); Recent is honest
        absence — no empty triage row.
      */}
      {searchField ? (
        <WorkbenchTriageBand
          search={searchField}
          controlsSlotRef={controlsSlotRef}
          controlsSlotProps={{ 'data-labels-products-controls': '' }}
        />
      ) : null}
    </>
  );
}

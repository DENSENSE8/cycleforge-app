'use client';

/**
 * Products Labels workbench chrome — Products · Recent · History tabs +
 * catalog / history search. Mirrors UnboxWorkspaceHeader / LabelsWorkspaceHeader.
 */

import { useMemo, type Ref } from 'react';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
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

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as LabelsSubView)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-labels-products-controls': '' }}
      className={className}
      search={
        isHistory ? (
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
            className="w-48 shrink-0 lg:w-64"
          />
        ) : isProducts ? (
          <TechRailSearchBar
            variant="chrome"
            value={search}
            onChange={onSearch}
            placeholder="Filter SKU, title…"
            className="w-40 shrink-0 lg:w-56"
          />
        ) : undefined
      }
    />
  );
}

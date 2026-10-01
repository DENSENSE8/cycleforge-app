'use client';

/** Searchable section selector for dense station timelines. */

import { useMemo, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { SearchableSelectField } from './SearchableSelectField';

export type SectionTabPriority = 'primary' | 'overflow';

export interface SectionTab {
  id: string;
  label: string;
  /** Optional because compact timeline selectors are text-only. */
  icon?: (props: { className?: string }) => JSX.Element;
  content: ReactNode;
  count?: number;
  /** Retained as authoring metadata while the searchable selector is validated. */
  priority?: SectionTabPriority;
  /** Body-only entries remain addressable without appearing as a selector option. */
  stripHidden?: boolean;
}

function resolveActiveTabId(tabs: ReadonlyArray<SectionTab>, value: string) {
  if (tabs.some((tab) => tab.id === value)) return value;
  return tabs[0]?.id;
}

export function SectionTabsSlider({
  tabs,
  value,
  onChange,
  ariaLabel = 'Sections',
  className,
}: {
  tabs: ReadonlyArray<SectionTab>;
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const activeId = resolveActiveTabId(tabs, value);
  const options = useMemo(
    () =>
      tabs.filter((tab) => !tab.stripHidden).map((tab) => ({
        value: tab.id,
        label:
          tab.count != null && tab.count > 0
            ? `${tab.label} · ${tab.count > 99 ? '99+' : tab.count}`
            : tab.label,
      })),
    [tabs],
  );

  return (
    <div className={cn('space-y-4', className)}>
      {tabs.length > 1 ? (
        <SearchableSelectField
          appearance="flush"
          value={activeId ?? null}
          onChange={(id) => {
            if (id != null) onChange(String(id));
          }}
          options={options}
          placeholder="Pick a section…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No sections match"
          ariaLabel={ariaLabel}
        />
      ) : null}

      <div>
        {tabs.map((tab) => (
          <div key={tab.id} hidden={tab.id !== activeId}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

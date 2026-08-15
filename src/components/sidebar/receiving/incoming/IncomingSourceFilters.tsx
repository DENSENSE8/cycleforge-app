'use client';

/**
 * Pipeline purchasing-source filter — All / Zoho / eBay / Amazon / Manual.
 *
 * Lives in the Band-3 search field trailing cluster (`trailingSuffix`, after
 * paste) via {@link WorkbenchFilterPopover} `density="field"`.
 *
 * Default is All (`?inbound=` omitted). Sources write `?inbound=<slug>`.
 */

import { useState } from 'react';
import {
  WorkbenchFilterHotChip,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PlatformMark } from '@/components/ui/PlatformMark';

export type IncomingSource = 'all' | 'zoho' | 'ebay' | 'amazon' | 'manual';

const SOURCE_OPTIONS: Array<{
  id: IncomingSource;
  label: string;
  /** Marketplace mark when the source is a platform; Zoho stays label-only. */
  platform?: string;
}> = [
  { id: 'all', label: 'All sources' },
  { id: 'zoho', label: 'Zoho' },
  { id: 'ebay', label: 'eBay', platform: 'ebay' },
  { id: 'amazon', label: 'Amazon', platform: 'amazon' },
  { id: 'manual', label: 'Manual' },
];

function sourceLabel(source: IncomingSource): string {
  return SOURCE_OPTIONS.find((o) => o.id === source)?.label ?? 'Filter';
}

/** Field-density source filter for the Pipeline search bar trailing slot. */
export function IncomingSourceFilters({
  source,
  onChange,
}: {
  source: IncomingSource;
  onChange: (next: IncomingSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const hot = source !== 'all';
  const hotLabel = hot ? sourceLabel(source) : undefined;

  return (
    <WorkbenchFilterPopover
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Source"
      hotActiveLabel={hotLabel}
      density="field"
      contentClassName="w-48"
    >
      <WorkbenchFilterMenuRow
        label="All sources"
        active={source === 'all'}
        sectionHeader
        onClick={() => {
          onChange('all');
          setOpen(false);
        }}
      />
      {SOURCE_OPTIONS.filter((o) => o.id !== 'all').map((opt) => (
        <WorkbenchFilterMenuRow
          key={opt.id}
          label={opt.label}
          active={source === opt.id}
          leading={
            opt.platform ? (
              <PlatformMark platformValue={opt.platform} textClassName="text-current" />
            ) : undefined
          }
          onClick={() => {
            onChange(opt.id);
            setOpen(false);
          }}
        />
      ))}
    </WorkbenchFilterPopover>
  );
}

/** Clearable source chip beside the Pipeline SearchField when hot. */
export function IncomingSourceHotChip({
  source,
  onClear,
}: {
  source: IncomingSource;
  onClear: () => void;
}) {
  if (source === 'all') return null;
  return <WorkbenchFilterHotChip label={sourceLabel(source)} onClear={onClear} />;
}

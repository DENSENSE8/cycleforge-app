'use client';

/**
 * Pipeline purchasing-source filter — All / Zoho / eBay.
 *
 * Lives in the Band-3 search field trailing cluster (`trailingSuffix`, after
 * paste) via {@link WorkbenchFilterPopover} `density="field"`. Replaces the
 * old All / Zoho / eBay TabSwitch facet strip under Pipeline | Docked.
 *
 * Default is All (`?inbound=` omitted). Zoho / eBay write `?inbound=zoho|ebay`.
 * Only mounts when universal Incoming is on (eBay purchasing wired) — otherwise
 * the org is Zoho-only and a source menu would be empty noise.
 *
 * When source ≠ `all`, callers also render {@link IncomingSourceHotChip}
 * beside the SearchField (floor glanceability).
 */

import { useState } from 'react';
import {
  WorkbenchFilterHotChip,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PlatformMark } from '@/components/ui/PlatformMark';

export type IncomingSource = 'all' | 'zoho' | 'ebay';

const SOURCE_OPTIONS: Array<{
  id: IncomingSource;
  label: string;
  /** Marketplace mark when the source is a platform; Zoho stays label-only. */
  platform?: string;
}> = [
  { id: 'all', label: 'All sources' },
  { id: 'zoho', label: 'Zoho' },
  { id: 'ebay', label: 'eBay', platform: 'ebay' },
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
              <PlatformMark platformValue={opt.platform} preferBrandTile textClassName="text-current" />
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

/** Clearable Zoho / eBay chip beside the Pipeline SearchField when hot. */
export function IncomingSourceHotChip({
  source,
  onClear,
}: {
  source: IncomingSource;
  onClear: () => void;
}) {
  if (source === 'all') return null;
  return (
    <WorkbenchFilterHotChip label={sourceLabel(source)} onClear={onClear} />
  );
}

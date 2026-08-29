'use client';

/**
 * Pipeline purchasing-source filter — All / Zoho / eBay / Amazon / Manual.
 *
 * Lives in the Band-3 search field trailing cluster (`trailingSuffix`, after
 * paste) via {@link FilterMenu} `density="field"`.
 *
 * Default is All (`?inbound=` omitted). Sources write `?inbound=<slug>`.
 */

import {
  FilterMenu,
  FilterMenuGroupLabel,
  FilterMenuRow,
} from '@/design-system/primitives/FilterMenu';
import { useState } from 'react';
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

/**
 * The source facet as MENU ROWS, for the Pipeline find field's ONE refine
 * funnel. Pipeline used to seat three `density="field"` popovers side by side —
 * Source, Kind and Filters — each painting the SAME funnel glyph, so the field
 * showed three identical marks and none of them said which was which. A facet
 * is a group inside the one funnel, never a second funnel beside it.
 */
export function IncomingSourceRows({
  source,
  onChange,
  onPick,
}: {
  source: IncomingSource;
  onChange: (next: IncomingSource) => void;
  onPick?: () => void;
}) {
  const pick = (next: IncomingSource) => {
    onChange(next);
    onPick?.();
  };
  return (
    <>
      <FilterMenuGroupLabel>Source</FilterMenuGroupLabel>
      <FilterMenuRow
        label="All sources"
        active={source === 'all'}
        onClick={() => pick('all')}
      />
      {SOURCE_OPTIONS.filter((o) => o.id !== 'all').map((opt) => (
        <FilterMenuRow
          key={opt.id}
          label={opt.label}
          active={source === opt.id}
          leading={
            opt.platform ? (
              <PlatformMark
                platformValue={opt.platform}
                preferBrandTile
                textClassName="text-current"
              />
            ) : undefined
          }
          onClick={() => pick(opt.id)}
        />
      ))}
    </>
  );
}

/**
 * Field-density source filter — the standalone trigger. Kept for a surface that
 * has no funnel of its own to fold into; Pipeline uses {@link IncomingSourceRows}.
 */
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
    <FilterMenu
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Source"
      contentClassName="w-48"
    >
      <FilterMenuRow
        label="All sources"
        active={source === 'all'}
        sectionHeader
        onClick={() => {
          onChange('all');
          setOpen(false);
        }}
      />
      {SOURCE_OPTIONS.filter((o) => o.id !== 'all').map((opt) => (
        <FilterMenuRow
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
    </FilterMenu>
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

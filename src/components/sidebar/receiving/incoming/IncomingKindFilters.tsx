'use client';

/**
 * Pipeline intake-kind filter — All / Purchases / Returns (`?inkind=`).
 * Band-3 search-field trailing cluster, same altitude as IncomingSourceFilters.
 */

import { useState } from 'react';
import {
  WorkbenchFilterGroupLabel,
  WorkbenchFilterHotChip,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';

export type IncomingKind = 'all' | 'purchase' | 'return';

const KIND_OPTIONS: Array<{ id: IncomingKind; label: string }> = [
  { id: 'all', label: 'All kinds' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'return', label: 'Returns' },
];

function kindLabel(kind: IncomingKind): string {
  return KIND_OPTIONS.find((o) => o.id === kind)?.label ?? 'Kind';
}

/** The kind facet as MENU ROWS — see {@link IncomingSourceRows} for why. */
export function IncomingKindRows({
  kind,
  onChange,
  onPick,
}: {
  kind: IncomingKind;
  onChange: (next: IncomingKind) => void;
  onPick?: () => void;
}) {
  const pick = (next: IncomingKind) => {
    onChange(next);
    onPick?.();
  };
  return (
    <>
      <WorkbenchFilterGroupLabel>Kind</WorkbenchFilterGroupLabel>
      <WorkbenchFilterMenuRow
        label="All kinds"
        active={kind === 'all'}
        onClick={() => pick('all')}
      />
      {KIND_OPTIONS.filter((o) => o.id !== 'all').map((opt) => (
        <WorkbenchFilterMenuRow
          key={opt.id}
          label={opt.label}
          active={kind === opt.id}
          onClick={() => pick(opt.id)}
        />
      ))}
    </>
  );
}

export function IncomingKindFilters({
  kind,
  onChange,
}: {
  kind: IncomingKind;
  onChange: (next: IncomingKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const hot = kind !== 'all';
  const hotLabel = hot ? kindLabel(kind) : undefined;

  return (
    <WorkbenchFilterPopover
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Kind"
      hotActiveLabel={hotLabel}
      density="field"
      contentClassName="w-48"
    >
      <WorkbenchFilterMenuRow
        label="All kinds"
        active={kind === 'all'}
        sectionHeader
        onClick={() => {
          onChange('all');
          setOpen(false);
        }}
      />
      {KIND_OPTIONS.filter((o) => o.id !== 'all').map((opt) => (
        <WorkbenchFilterMenuRow
          key={opt.id}
          label={opt.label}
          active={kind === opt.id}
          onClick={() => {
            onChange(opt.id);
            setOpen(false);
          }}
        />
      ))}
    </WorkbenchFilterPopover>
  );
}

export function IncomingKindHotChip({
  kind,
  onClear,
}: {
  kind: IncomingKind;
  onClear: () => void;
}) {
  if (kind === 'all') return null;
  return <WorkbenchFilterHotChip label={kindLabel(kind)} onClear={onClear} />;
}

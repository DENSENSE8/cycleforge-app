'use client';

/**
 * Team (desk face) — who picks each product and which packer they bring it to.
 * Logic lives in `useRuleAssignments`; this paints the per-line chips.
 * "Everyone" sets every line at once.
 */

import { useRef, useState } from 'react';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import type { StageStaffLane } from '@/components/tables/compound/staff-stage-lane';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';
import { TriageLineIdentity } from '@/design-system/components/triage-shelf/TriageCartLine';
import { shelfOfSku } from '@/lib/orders/intake/catalog-shelf';
import { teamLineFacts } from '@/lib/orders/intake/checkout-model';
import {
  LANE_LABEL,
  assigneeSourceLabel,
  lineRuleLabel,
  type AssigneePick,
  type Lane,
  type LineAssignment,
} from '@/hooks/orders/useRuleAssignments';

const LANE_ROLE: Record<Lane, StageStaffLane> = { picker: 'technician', packer: 'packer' };

export function CheckoutAssignments({
  lines,
  byKey,
  onSet,
}: {
  lines: readonly IntakeLine[];
  byKey: Record<string, LineAssignment>;
  onSet: (keys: readonly string[], lane: Lane, id: number | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState<{ keys: string[]; lane: Lane; selected: number | null } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  if (lines.length === 0) {
    return <p className="text-role-caption text-text-muted">Add products — each one's picker and packer show here.</p>;
  }

  const openAt = (el: HTMLElement, keys: string[], lane: Lane, selected: number | null) => {
    anchorRef.current = el;
    setOpen({ keys, lane, selected });
  };
  const allKeys = lines.map((l) => l.key);

  const chip = (keys: string[], lane: Lane, pick: AssigneePick | null, testId: string) => (
    <button
      type="button"
      onClick={(e) => openAt(e.currentTarget, keys, lane, pick?.id ?? null)}
      className={cn(
        'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-mode-control border px-2.5 text-role-caption hover:bg-surface-hover',
        pick ? 'border-border-soft text-text-default' : 'border-dashed border-border-soft text-text-muted',
        focusRing('control'),
      )}
      data-testid={testId}
    >
      <span className="text-text-muted">{LANE_LABEL[lane]}</span>
      <span className="truncate font-medium">{pick?.name ?? 'Unassigned'}</span>
      {pick ? (
        <span
          className={cn(
            'rounded-mode-pill px-1.5 text-role-micro',
            pick.source === 'manual' ? 'bg-surface-warning text-text-warning' : 'bg-surface-sunken text-text-muted',
          )}
        >
          {assigneeSourceLabel(pick)}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="space-y-3" data-testid="checkout-assignments">
      {lines.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-mode-control bg-surface-sunken px-3 py-2">
          <span className="text-role-caption font-medium text-text-default">Everyone</span>
          {chip(allKeys, 'picker', null, 'checkout-assign-all-picker')}
          <span aria-hidden className="text-text-faint">→</span>
          {chip(allKeys, 'packer', null, 'checkout-assign-all-packer')}
        </div>
      ) : null}
      <ul className="divide-y divide-border-hairline">
        {lines.map((line, index) => {
          const a = byKey[line.key];
          return (
            <li key={line.key} className="space-y-1.5 py-2.5" data-testid={`checkout-assign-line-${index + 1}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TriageLineIdentity
                    size="sm"
                    quantity={line.quantity}
                    title={line.title}
                    facts={teamLineFacts(line)}
                    repair={shelfOfSku(line.sku) === 'repair'}
                  />
                </div>
                <p className="shrink-0 text-role-micro text-text-muted">{lineRuleLabel(a)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {chip([line.key], 'picker', a?.picker ?? null, 'checkout-assign-picker')}
                <span aria-hidden className="text-text-faint">→</span>
                {chip([line.key], 'packer', a?.packer ?? null, 'checkout-assign-packer')}
              </div>
            </li>
          );
        })}
      </ul>
      <StageStaffAssignPopover
        open={open != null}
        onClose={() => setOpen(null)}
        anchorRef={anchorRef}
        label={open ? LANE_LABEL[open.lane] : 'Pick'}
        role={open ? LANE_ROLE[open.lane] : 'technician'}
        selectedStaffId={open?.selected ?? null}
        onCommit={(id, name) => {
          if (open) onSet(open.keys, open.lane, id, name);
        }}
      />
    </div>
  );
}

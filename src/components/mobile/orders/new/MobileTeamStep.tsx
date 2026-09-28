'use client';

/**
 * Team (phone face) — who picks each product and which packer they bring it
 * to. Rule defaults and manual exceptions live in `useRuleAssignments`; this
 * paints one Pick and one Pack row per line, and a staff chooser sheet from
 * the active roster (`@/lib/staffCache`, the desk combo's source). "Everyone"
 * sets every line at once.
 */

import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Check, ChevronRight } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { MobileFormHeading } from './MobileFormHeading';
import { getActiveStaff, peekActiveStaff, type StaffMember } from '@/lib/staffCache';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';
import { TriageLineIdentity } from '@/design-system/components/triage-shelf/TriageCartLine';
import { focusRing } from '@/design-system/tokens/focus-ring';
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
import { cn } from '@/utils/_cn';

/** A touch row in the form's triage voice — press washes the row, never inverts it. */
const ROW_CLASS = cn(
  'group flex min-h-mode-hit-cta w-full items-center gap-3 border-b border-mode-rule px-mode-page py-2.5 text-left',
  'bg-mode-panel active:bg-mode-hover',
  focusRing('field', 'accent'),
);

type Chooser = { keys: string[]; lane: Lane; selected: number | null; title: string };

export function MobileTeamStep({
  lines,
  byKey,
  onSet,
}: {
  lines: readonly IntakeLine[];
  byKey: Record<string, LineAssignment>;
  onSet: (keys: readonly string[], lane: Lane, id: number | null, name: string | null) => void;
}) {
  const [chooser, setChooser] = useState<Chooser | null>(null);

  if (lines.length === 0) {
    return (
      <div className="bg-mode-panel" data-testid="m-order-team">
        <p className="px-mode-page py-3 text-role-caption text-mode-muted">Add products — each one's picker and packer show here.</p>
      </div>
    );
  }

  const laneRow = (keys: string[], lane: Lane, pick: AssigneePick | null, title: string, testId: string) => (
    <button
      type="button"
      onClick={() => setChooser({ keys, lane, selected: pick?.id ?? null, title })}
      className={ROW_CLASS}
      data-testid={testId}
    >
      <span className="w-10 shrink-0 text-role-caption font-medium text-mode-muted">{LANE_LABEL[lane]}</span>
      <span className={cn('min-w-0 flex-1 truncate text-mode-body', pick ? 'font-semibold text-mode-ink' : 'text-mode-muted')}>
        {pick?.name ?? (keys.length > 1 ? 'Set for every line' : 'Unassigned')}
      </span>
      {pick ? (
        <span
          className={cn(
            'shrink-0 rounded-mode-pill px-1.5 text-role-micro',
            pick.source === 'manual' ? 'bg-surface-warning text-text-warning' : 'bg-mode-well text-mode-muted',
          )}
        >
          {assigneeSourceLabel(pick)}
        </span>
      ) : null}
      <ChevronRight className="h-5 w-5 shrink-0 text-mode-muted" />
    </button>
  );

  const allKeys = lines.map((l) => l.key);

  return (
    <div className="bg-mode-panel" data-testid="m-order-team">
      {lines.length > 1 ? (
        <section aria-labelledby="m-order-team-everyone">
          <MobileFormHeading id="m-order-team-everyone">Everyone</MobileFormHeading>
          {laneRow(allKeys, 'picker', null, 'Pick · every line', 'm-order-team-all-picker')}
          {laneRow(allKeys, 'packer', null, 'Pack · every line', 'm-order-team-all-packer')}
        </section>
      ) : null}
      {lines.map((line, index) => {
        const a = byKey[line.key];
        return (
          <section key={line.key} aria-label={line.title} data-testid={`m-order-team-line-${index + 1}`}>
            <div className="space-y-0.5 bg-mode-well px-mode-page py-2">
              <TriageLineIdentity
                size="sm"
                quantity={line.quantity}
                title={line.title}
                facts={teamLineFacts(line)}
                repair={shelfOfSku(line.sku) === 'repair'}
              />
              <p className="truncate text-role-micro text-mode-muted">{lineRuleLabel(a)}</p>
            </div>
            {laneRow([line.key], 'picker', a?.picker ?? null, `Pick · ${line.title}`, 'm-order-team-picker')}
            {laneRow([line.key], 'packer', a?.packer ?? null, `Pack · ${line.title}`, 'm-order-team-packer')}
          </section>
        );
      })}
      <MobileStaffChooserSheet
        chooser={chooser}
        onClose={() => setChooser(null)}
        onPick={(id, name) => {
          if (chooser) onSet(chooser.keys, chooser.lane, id, name);
          setChooser(null);
        }}
      />
    </div>
  );
}

/**
 * Staff chooser — the lane's roster (functional role Pick / Pack), the current
 * assignee kept visible even off-lane. Tapping the current one clears it, as
 * on the desk combo.
 */
function MobileStaffChooserSheet({
  chooser,
  onClose,
  onPick,
}: {
  chooser: Chooser | null;
  onClose: () => void;
  onPick: (id: number | null, name: string | null) => void;
}) {
  const open = chooser != null;
  const [roster, setRoster] = useState<StaffMember[] | null>(() => peekActiveStaff());

  useEffect(() => {
    if (!open) return;
    let active = true;
    getActiveStaff()
      .then((rows) => {
        if (active) setRoster(rows);
      })
      .catch(() => {
        if (active) setRoster([]);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const rows = useMemo(() => {
    if (!chooser || !roster) return [];
    return roster
      .filter((m) => m.id > 0 && m.name.trim() && (m.id === chooser.selected || m.functionalRoles.includes(chooser.lane)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [chooser, roster]);

  return (
    <BottomSheet open={open} onClose={onClose} forceVariant="sheet" title={chooser?.title} scrollBody level={1}>
      <div data-testid="m-order-team-chooser">
        {roster == null ? (
          <p className="px-mode-page py-3 text-role-caption text-mode-muted">Loading staff…</p>
        ) : rows.length === 0 ? (
          <p className="px-mode-page py-3 text-role-caption text-mode-muted">
            {chooser?.lane === 'packer' ? 'No packers on the roster.' : 'No pickers on the roster.'}
          </p>
        ) : (
          <ul aria-label={chooser ? `${LANE_LABEL[chooser.lane]} staff` : undefined}>
            {rows.map((m) => {
              const selected = m.id === chooser?.selected;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => (selected ? onPick(null, null) : onPick(m.id, m.name))}
                    className={ROW_CLASS}
                    data-testid="m-order-team-staff"
                  >
                    <StaffAvatar staffId={m.id} name={m.name} size="sm" colorRing alt="" />
                    <span className="min-w-0 flex-1 truncate text-mode-body font-semibold text-mode-ink">{m.name}</span>
                    {selected ? (
                      <span className="flex shrink-0 items-center gap-1 text-role-caption text-text-accent">
                        <Check className="h-4 w-4" />
                        Tap to clear
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

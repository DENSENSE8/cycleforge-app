'use client';

/**
 * The composer's FIELD leaves — the presentational parts of the phone's add-a-task form, extracted so the sheet file stays a shell…
 * NO GLYPH PICKER here (operator ruling 2026-09-15 — "it wouldn't even have
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { MOBILE_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { type DailyComposerDraft } from '@/lib/daily-checks/composer';

export const TITLE_INPUT_CLASS = cn(
  'min-h-12 w-full border border-border-hairline bg-surface-card px-3',
  'text-role-field text-text-default placeholder:text-text-faint',
  MOBILE_CONTROL_CORNER,
  focusRing('field', 'accent'),
);

/** The embedded owner step — the panel SoT, rows painted with StaffAvatar. */
export function OwnerStep({
  selectedStaffId,
  onPick,
}: {
  selectedStaffId: number | null;
  onPick: (member: StaffMember | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getActiveStaff()
      .then((rows) => {
        if (!active) return;
        setOptions([...rows].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        if (active) setOptions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .map((m) => ({
        id: m.id,
        name: m.name,
        selected: selectedStaffId === m.id,
        leading: <StaffAvatar staffId={m.id} name={m.name} size="sm" colorRing alt="" />,
      }));
  }, [options, query, selectedStaffId]);

  return (
    <div className="flex flex-col gap-1.5">
      <AssigneeComboboxPanel
        query={query}
        onQueryChange={setQuery}
        rows={rows}
        loading={loading}
        emptyMessage={loading ? 'Loading staff…' : 'No staff'}
        roster={false}
        onSelect={(row) => {
          const member = options.find((m) => m.id === row.id) ?? null;
          onPick(member);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onPick(null)}
      >
        Whole shift instead
      </Button>
    </div>
  );
}

/** The FALLBACK link row: */
function LinkFields({
  draft,
  onChange,
}: {
  draft: DailyComposerDraft;
  onChange: (patch: Partial<DailyComposerDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Ticket #"
        value={draft.ticketId}
        onChange={(ticketId) => onChange({ ticketId })}
        inputMode="numeric"
        aria-label="Link a Zendesk ticket"
      />
      <TextField
        label="Work order #"
        value={draft.workOrderId}
        onChange={(workOrderId) => onChange({ workOrderId })}
        inputMode="numeric"
        aria-label="Link a work order"
      />
      <TextField
        label="Tracking"
        value={draft.tracking}
        onChange={(tracking) => onChange({ tracking })}
        aria-label="Link a tracking number"
      />
    </div>
  );
}

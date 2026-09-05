'use client';

/**
 * Receiving-line bulk assign — AssigneeCombobox hosted in the right rail.
 *
 * Plan §5.4: one host in ReceivingLineRailShell so Assign to… is a live verb
 * on every surface that mounts the receiving catalog. Not a Dialog.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AssigneeComboboxPanel,
  type AssigneeComboboxRow,
} from '@/design-system/components/AssigneeCombobox';
import { StaffAvatar } from '@/components/identity';
import { getActiveStaff, peekActiveStaff, type StaffMember } from '@/lib/staffCache';
import { staffMatchesStageLane } from '@/components/tables/compound/staff-stage-lane';
import { assignReceivingLines } from '@/lib/receiving/assign-receiving-lines';
import {
  closeReceivingAssignPanel,
  useReceivingAssignPanelOpen,
} from '@/lib/tables/receiving-assign-panel-store';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function ReceivingAssignPanel() {
  const open = useReceivingAssignPanelOpen();
  const { scope, rows } = useRailActionSnapshot();
  const lineRows = rows as ReceivingLineRow[];
  const queryClient = useQueryClient();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<StaffMember[]>(() => peekActiveStaff() ?? []);
  const [loading, setLoading] = useState(() => !peekActiveStaff());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lineRows.length === 0) closeReceivingAssignPanel();
  }, [lineRows.length]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const cached = peekActiveStaff();
    if (cached) {
      setOptions(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    getActiveStaff()
      .then((members) => {
        if (cancelled) return;
        const list = Array.isArray(members) ? members : [];
        setOptions(
          list
            .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.name.trim())
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeReceivingAssignPanel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const comboRows = useMemo<AssigneeComboboxRow[]>(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => staffMatchesStageLane(o, 'technician'))
      .filter((o) => !q || o.name.toLowerCase().includes(q))
      .map((o) => ({
        id: o.id,
        name: o.name,
        leading: <StaffAvatar staffId={o.id} name={o.name} size="xs" />,
        assignable: true,
      }));
  }, [options, query]);

  if (!open) return null;

  return (
    <div className="shrink-0 border-t border-border-subtle bg-surface-card p-2">
      <AssigneeComboboxPanel
        query={query}
        onQueryChange={setQuery}
        rows={comboRows}
        loading={loading || saving}
        emptyMessage="No technicians"
        roster={false}
        heading={`Assign ${lineRows.length} line${lineRows.length === 1 ? '' : 's'}`}
        listId={listId}
        onEscape={closeReceivingAssignPanel}
        disabled={saving}
        onSelect={(row) => {
          if (saving) return;
          setSaving(true);
          void assignReceivingLines({
            rows: lineRows,
            techId: row.id,
            queryClient,
            selectionScope: scope,
          }).finally(() => {
            setSaving(false);
            closeReceivingAssignPanel();
          });
        }}
      />
    </div>
  );
}

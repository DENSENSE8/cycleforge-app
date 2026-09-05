/**
 * PATCH `assigned_tech_id` on selected receiving lines — shared by the
 * receiving verb catalog (Assign to me) and the rail AssigneeCombobox host.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { toast } from '@/lib/toast';
import { emitToggleAll } from '@/lib/selection/table-selection';

async function patchAssignedTech(lineId: number, assignedTechId: number): Promise<void> {
  const res = await fetch('/api/receiving-lines', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lineId, assigned_tech_id: assignedTechId }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error || `Assign failed (${res.status})`);
  }
}

export async function assignReceivingLines(args: {
  rows: ReceivingLineRow[];
  techId: number;
  queryClient: QueryClient;
  selectionScope: string | null;
}): Promise<void> {
  const { rows, techId, queryClient, selectionScope } = args;
  if (rows.length === 0 || !(techId > 0)) return;
  const ids = new Set(rows.map((r) => r.id));

  queryClient.setQueriesData<{ receiving_lines?: ReceivingLineRow[] }>(
    { queryKey: ['testing-workspace'] },
    (prev) => {
      if (!prev || !Array.isArray(prev.receiving_lines)) return prev;
      return {
        ...prev,
        receiving_lines: prev.receiving_lines.map((row) =>
          ids.has(row.id) ? { ...row, assigned_tech_id: techId } : row,
        ),
      };
    },
  );

  const results = await Promise.allSettled(rows.map((row) => patchAssignedTech(row.id, techId)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  const ok = results.length - failed;
  if (ok > 0) {
    toast.success(
      failed > 0
        ? `Assigned ${ok} of ${results.length} lines`
        : `Assigned ${ok} line${ok === 1 ? '' : 's'}`,
    );
  }
  if (failed > 0 && ok === 0) {
    toast.error('Could not assign the selected lines');
  }
  await queryClient.invalidateQueries({ queryKey: ['testing-workspace'] });
  await queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
  await queryClient.invalidateQueries({ queryKey: ['receiving-lines'] });
  if (selectionScope) emitToggleAll(selectionScope, 'none');
}

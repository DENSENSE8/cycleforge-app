'use client';

import { useQuery } from '@tanstack/react-query';
import type { RepairActivityEntry } from '@/lib/repair/repair-activity';
import { formatMonthDayTimePST } from '@/utils/date';

const HIDDEN_FIELDS = new Set(['updated_at', 'status_history', 'version']);
const FIELD_LABELS: Record<string, string> = {
  product_title: 'Device',
  issue: 'Issue',
  serial_number: 'Serial',
  price: 'Price',
  notes: 'Notes',
  contact_info: 'Customer',
  customer_id: 'Customer link',
  ticket_number: 'Ticket',
  status: 'Status',
  source_system: 'Source system',
  source_order_id: 'Source order',
  source_tracking_number: 'Tracking',
  source_sku: 'SKU',
  intake_channel: 'Ingress',
  label_printed_at: 'Label printed',
};

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function changedFields(entry: RepairActivityEntry): { key: string; before: string; after: string }[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const preferred = typeof entry.metadata?.field === 'string' ? entry.metadata.field : null;
  const keys = preferred ? [preferred] : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.flatMap((key) => {
    if (HIDDEN_FIELDS.has(key)) return [];
    const left = displayValue(before[key]);
    const right = displayValue(after[key]);
    return left === right ? [] : [{ key, before: left, after: right }];
  });
}

function actionFace(action: string): string {
  const tail = action.split('.').pop()?.replaceAll('_', ' ') ?? action;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

/** Before/after audit rows, visible in the record beneath workflow history. */
export function RepairActivityLog({ repairId }: { repairId: number }) {
  const query = useQuery({
    queryKey: ['repairs', 'workbench', repairId, 'activity'],
    queryFn: async ({ signal }): Promise<RepairActivityEntry[]> => {
      const response = await fetch(`/api/repair-service/${repairId}/activity`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { activity?: RepairActivityEntry[] };
      return Array.isArray(body.activity) ? body.activity : [];
    },
  });

  if (query.isPending) return <p className="px-4 py-3 text-role-caption text-mode-muted">Loading activity…</p>;
  if (query.isError) return <p role="alert" className="px-4 py-3 text-role-caption font-semibold text-rose-700">Could not load activity.</p>;
  if (!query.data?.length) return <p className="px-4 py-3 text-role-caption text-mode-muted">No audited changes yet.</p>;

  return (
    <ul className="divide-y divide-mode-rule" data-testid="repair-activity-log">
      {query.data.map((entry) => {
        const changes = changedFields(entry);
        return (
          <li key={entry.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-role-caption font-semibold text-mode-ink">{actionFace(entry.action)}</p>
              <time dateTime={entry.createdAt} className="text-role-micro tabular-nums text-mode-muted">{formatMonthDayTimePST(entry.createdAt)}</time>
            </div>
            <p className="mt-0.5 text-role-micro text-mode-muted">{entry.actorName || entry.actorRole || 'System'} · {entry.source}</p>
            {changes.length ? (
              <dl className="mt-2 grid gap-1 text-role-caption">
                {changes.map((change) => (
                  <div key={change.key} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                    <dt className="font-semibold text-mode-muted">{FIELD_LABELS[change.key] ?? change.key.replaceAll('_', ' ')}</dt>
                    <dd className="min-w-0 break-words text-mode-ink"><span className="text-mode-muted line-through">{change.before}</span> → {change.after}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

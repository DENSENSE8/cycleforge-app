'use client';

/**
 * Inventory dossier Activity — receive events + provider activity from the
 * shared incoming/details payload (read-first).
 */

import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { fmtDateTime } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { Empty } from '@/components/sidebar/receiving/incoming-details/incoming-details-primitives';
import { cn } from '@/utils/_cn';

/** Exported for contract tests — Unreceive spine rows are ADJUSTED *or* NOTE. */
export function receiveEventLabel(ev: DetailsResponse['receive_events'][number]): string {
  const notes = (ev.notes || '').toLowerCase();
  // Workflow rewind writes NOTE + "Unreceive: …"; ledger reverse writes ADJUSTED.
  // Match notes first so neither paints as raw event_type.
  if (notes.includes('unreceive')) return 'Unreceive';
  if (ev.event_type === 'RECEIVED') return 'Receive';
  return ev.event_type;
}

export function InventoryActivityPanel({ data }: { data: DetailsResponse }) {
  const receives = data.receive_events ?? [];
  const zohoActivity = data.zoho_activity ?? [];

  if (receives.length === 0 && zohoActivity.length === 0) {
    return (
      <div className="px-2 py-3" data-testid="inventory-activity-panel">
        <Empty msg="No receive or inventory activity for this order yet." />
      </div>
    );
  }

  return (
    <div className="space-y-0" data-testid="inventory-activity-panel">
      {receives.length > 0 ? (
        <section>
          <p className="border-b border-border-hairline px-2 py-1.5 text-role-eyebrow uppercase tracking-wider text-text-soft">
            Receive events
          </p>
          <ul className="divide-y divide-border-hairline">
            {receives.map((ev) => (
              <li key={ev.id} className="px-2 py-2">
                <p className="text-role-caption font-semibold text-text-default">
                  {receiveEventLabel(ev)}
                  {ev.sku ? (
                    <span className="ml-2 font-medium text-text-muted">· {ev.sku}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-role-micro text-text-soft">
                  {fmtDateTime(ev.occurred_at)}
                  {ev.actor_name ? ` · ${ev.actor_name}` : ''}
                  {ev.serial_number ? ` · ${ev.serial_number}` : ''}
                </p>
                {ev.notes ? (
                  <p className="mt-1 text-role-caption text-text-muted">{ev.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {zohoActivity.length > 0 ? (
        <section className={cn(receives.length > 0 && 'border-t border-border-hairline')}>
          <p className="border-b border-border-hairline px-2 py-1.5 text-role-eyebrow uppercase tracking-wider text-text-soft">
            Inventory activity
          </p>
          <ul className="divide-y divide-border-hairline">
            {zohoActivity.map((ev, idx) => (
              <li key={`${ev.timestamp ?? 't'}-${idx}`} className="px-2 py-2">
                <p className="text-role-caption font-semibold text-text-default">{ev.label}</p>
                <p className="mt-0.5 text-role-micro text-text-soft">
                  {fmtDateTime(ev.timestamp)}
                </p>
                {ev.description ? (
                  <p className="mt-1 text-role-caption text-text-muted">{ev.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

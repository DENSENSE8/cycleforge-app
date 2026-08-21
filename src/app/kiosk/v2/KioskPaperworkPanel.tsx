'use client';

/**
 * Walk-in paperwork panel — the visit's document, live, beside the work.
 *
 * @domain-job Show the operator/customer exactly what this visit will print.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification The repair agreement was reachable only from inside the
 *   Repair pane and only ever described ONE serialized product, so a visit that
 *   mixed a repair, a retail line and a buyback printed nothing that named the
 *   other two. This panel is the visit-level face: customer identification
 *   once, then one identified row per cart line, with the repair agreement
 *   sheet underneath while a repair line exists.
 *
 * Staged toward the unified walk-in document — plan:
 * `docs/todo/kiosk-walkin-paperwork-PLAN.md`. The legal sheet below is still
 * `RepairServiceForm` (unchanged wording); only the identification header is
 * new, so nothing a customer signs changes shape in this step.
 */

import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { isBuybackPayload, isRepairPayload } from '@/lib/kiosk/cart-line';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { useKioskSession } from '@/lib/kiosk/kiosk-session-store';
import {
  KIOSK_UTILITY_PANEL_FACE,
  KIOSK_META,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_SECTION_LABEL_ROW,
} from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The identifier a line is claimed by — serial for a repair, IMEI for a
 * buyback, SKU for retail. Every printed row carries one, so a customer can
 * point at the paper and say which of their things it is.
 */
export function lineIdentification(line: KioskCartLine): {
  label: string;
  value: string;
} {
  if (isRepairPayload(line.payload)) {
    return {
      label: 'Serial',
      value: line.payload.serialNumber?.trim() || line.payload.imei?.trim() || '—',
    };
  }
  if (isBuybackPayload(line.payload)) {
    return { label: 'IMEI', value: line.payload.imei?.trim() || '—' };
  }
  return { label: 'SKU', value: line.payload.sku?.trim() || '—' };
}

export function KioskPaperworkPanel() {
  const session = useKioskSession();
  const repairLine = session.lines.find((l) => isRepairPayload(l.payload));
  const repairPayload =
    repairLine && isRepairPayload(repairLine.payload) ? repairLine.payload : null;

  const contact =
    [session.customerPhone, session.customerEmail].filter(Boolean).join(', ') || '—';

  return (
    <aside className={KIOSK_UTILITY_PANEL_FACE} data-testid="kiosk-paperwork-panel">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Paperwork</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section>
          <h3 className={KIOSK_SECTION_LABEL_ROW}>
            Customer
          </h3>
          <dl className="space-y-1 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className={KIOSK_META}>Name</dt>
              <dd className="truncate text-sm font-semibold">
                {session.customerName || '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className={KIOSK_META}>Contact</dt>
              <dd className="truncate text-sm font-semibold tabular-nums">{contact}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3 className={KIOSK_SECTION_LABEL_ROW}>
            Items on this visit
          </h3>
          {session.lines.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm font-semibold text-text-soft">
              Nothing on the ticket yet.
            </p>
          ) : (
            <ul className="divide-y divide-border-hairline">
              {session.lines.map((line) => {
                const id = lineIdentification(line);
                return (
                  <li key={line.id} className="px-4 py-2.5" data-testid="kiosk-paperwork-line">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {line.title}
                      </p>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCents(line.unitAmountCents * line.quantity)}
                      </span>
                    </div>
                    <p className={cn('mt-0.5 uppercase tracking-widest', KIOSK_META)}>
                      {id.label} · <span className="font-mono normal-case">{id.value}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {repairPayload && (
          <section className="border-t border-border-hairline">
            <h3 className={KIOSK_SECTION_LABEL_ROW}>
              Repair service agreement
            </h3>
            <div className="p-3">
              <RepairPaperworkCanvas align="full">
                <RepairServiceForm
                  surface="screen"
                  density="compact"
                  ticketNumber=""
                  productTitle={repairPayload.productModel || '—'}
                  issue={
                    repairPayload.repairReasons?.join(', ') ||
                    repairPayload.repairNotes ||
                    '—'
                  }
                  serialNumber={repairPayload.serialNumber || '—'}
                  name={session.customerName || '—'}
                  contact={contact}
                  price={repairPayload.price || '—'}
                  startDateTime=""
                />
              </RepairPaperworkCanvas>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

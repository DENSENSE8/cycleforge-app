'use client';

/**
 * Walk-in paperwork panel — the visit's document, live, beside the work.
 *
 * @domain-job Show the operator/customer exactly what this visit will print.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification The repair agreement was reachable only from inside the
 *   Repair pane and only ever described ONE serialized product, so a visit that
 *   mixed a repair and a retail line printed nothing that named the other.
 *   This panel is the visit-level face: customer identification once, then one
 *   identified row per cart line, with the repair agreement sheet underneath
 *   while a repair line exists.
 *
 * NO TITLE BAND of its own (2026-09-23). The shell paints the ONE header band
 * above this sheet while it is open, and that band's paperwork toggle is both
 * the name of this panel and its way back — a `Paperwork` title and a close X
 * under it were a second band repeating the toggle's own name.
 *
 * Staged toward the unified walk-in document — plan:
 * `docs/todo/kiosk-walkin-paperwork-PLAN.md`. The legal sheet below is still
 * `RepairServiceForm` (unchanged wording).
 */

import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { isRepairPayload } from '@/lib/kiosk/cart-line';
import { lineIdentification } from '@/lib/kiosk/line-identification';
import { useKioskSession } from '@/lib/kiosk/kiosk-session-store';
import { KIOSK_UTILITY_SHEET, KIOSK_META, KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function KioskPaperworkPanel() {
  const session = useKioskSession();
  const repairLine = session.lines.find((l) => isRepairPayload(l.payload));
  const repairPayload =
    repairLine && isRepairPayload(repairLine.payload) ? repairLine.payload : null;

  const contact =
    [session.customerPhone, session.customerEmail].filter(Boolean).join(', ') || '—';

  return (
    <aside className={KIOSK_UTILITY_SHEET} data-testid="kiosk-paperwork-panel">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section>
          <h3 className={KIOSK_SECTION_LABEL_ROW}>
            Customer
          </h3>
          <dl className="space-y-1 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className={KIOSK_META}>Name</dt>
              <dd className="truncate text-xs font-semibold">
                {session.customerName || '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className={KIOSK_META}>Contact</dt>
              <dd className="truncate text-xs font-semibold tabular-nums">{contact}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className={KIOSK_META}>Address</dt>
              <dd className="truncate text-xs font-semibold">{session.customerAddress || '—'}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3 className={KIOSK_SECTION_LABEL_ROW}>
            Items
          </h3>
          {session.lines.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm font-semibold text-text-soft">
              No items yet.
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

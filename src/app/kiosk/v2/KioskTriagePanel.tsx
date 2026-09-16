'use client';

/**
 * Triage panel — every open issue on this visit, with a jump to the fix.
 *
 * @domain-job Show the operator everything blocking this ticket at once.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification Submit used to fail with ONE sentence at a time, unattributed:
 *   "Repair line needs a serial number" with three lines on the ticket and no
 *   way to tell which. This is the whole list, worst-first, each row naming its
 *   line and opening that line's editor on the failing field.
 *
 * Reads {@link collectKioskTriage} — the same model behind the Save/Pay gate,
 * so this list and the button are structurally incapable of disagreeing.
 */

import { AlertTriangle, Check } from '@/components/Icons';
import { useKioskSession } from '@/lib/kiosk/kiosk-session-store';
import {
  collectKioskTriage,
  type KioskTriageItem,
} from '@/lib/kiosk/visit-triage';
import {
  KIOSK_UTILITY_SHEET,
  KIOSK_META,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_SECTION_LABEL_ROW,
} from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

export function KioskTriagePanel({
  onResolve,
}: {
  /** Route the operator to the fix — line editor, or the customer block. */
  onResolve: (item: KioskTriageItem) => void;
}) {
  const session = useKioskSession();
  const items = collectKioskTriage({
    lines: session.lines,
    customerPhone: session.customerPhone,
    customerName: session.customerName,
    customerEmail: session.customerEmail,
    // Callers: KioskCartLedger blockers. User: "intake their information like name, email address, phone number, address"
    customerAddress: session.customerAddress,
  });
  const blockers = items.filter((i) => i.severity === 'block');
  const warnings = items.filter((i) => i.severity === 'warn');

  return (
    <aside className={KIOSK_UTILITY_SHEET} data-testid="kiosk-triage-panel">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Triage</h2>
        <span className={cn('tabular-nums', KIOSK_META)}>
          {blockers.length} blocking
        </span>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Check className="h-8 w-8 text-text-success" />
            <p className="text-lg font-semibold tracking-tight">Ticket is clear</p>
            <p className="text-sm font-semibold text-text-soft">
              Nothing is blocking this visit.
            </p>
          </div>
        ) : (
          <>
            {blockers.length > 0 && (
              <TriageSection
                heading="Blocking submit"
                items={blockers}
                onResolve={onResolve}
              />
            )}
            {warnings.length > 0 && (
              <TriageSection heading="Worth a look" items={warnings} onResolve={onResolve} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function TriageSection({
  heading,
  items,
  onResolve,
}: {
  heading: string;
  items: KioskTriageItem[];
  onResolve: (item: KioskTriageItem) => void;
}) {
  return (
    <section>
      <h3 className={KIOSK_SECTION_LABEL_ROW}>
        {heading}
      </h3>
      <ul className="divide-y divide-border-hairline">
        {items.map((item) => (
          <li key={item.id}>
            {/* ds-raw-button: full-width nav row — tap goes to the fix. */}
            <button
              type="button"
              onClick={() => onResolve(item)}
              data-testid="kiosk-triage-item"
              data-severity={item.severity}
              className={cn(
                'ds-raw-button flex w-full items-start gap-3 px-4 py-3 text-left',
                'transition-colors hover:bg-surface-hover',
              )}
            >
              <AlertTriangle
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  item.severity === 'block' ? 'text-text-danger' : 'text-text-warning',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text-default">
                  {item.message}
                </span>
                <span className={cn('mt-0.5 block uppercase tracking-widest', KIOSK_META)}>
                  {item.target === 'customer'
                    ? 'Customer'
                    : item.target === 'cart'
                      ? 'Ticket'
                      : (item.lineTitle ?? 'Line')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

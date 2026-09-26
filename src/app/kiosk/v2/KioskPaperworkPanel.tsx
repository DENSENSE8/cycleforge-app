'use client';

/**
 * Walk-in paperwork panel — the visit's repair agreement sheets, live, beside the work.
 * @justification Paperwork is just paperwork (operator 2026-09-25: "remove the
 */

import { useMemo } from 'react';
import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { repairDevicesFromLines } from '@/lib/kiosk/repair-devices';
import {
  repairPaperworkSheets,
  repairVisitFactsFromLines,
} from '@/lib/kiosk/repair-paperwork-sheets';
import { useKioskSession } from '@/lib/kiosk/kiosk-session-store';
import { paperworkTicketNumber, useNextTicketPreview } from '@/lib/kiosk/use-next-ticket-preview';
import { KIOSK_UTILITY_SHEET } from '@/app/kiosk/kiosk-chrome';

export function KioskPaperworkPanel() {
  const session = useKioskSession();
  const devices = useMemo(() => repairDevicesFromLines(session.lines), [session.lines]);
  const visit = useMemo(() => repairVisitFactsFromLines(session.lines), [session.lines]);
  // Same number the Review & sign sheets state — a blank heading here read as
  // "no ticket" to the operator.
  const ticketNumber = paperworkTicketNumber(
    session.ticketChoice,
    useNextTicketPreview(devices.length > 0),
  );

  const sheets = useMemo(
    () =>
      repairPaperworkSheets({
        customer: {
          name: session.customerName,
          phone: session.customerPhone,
          email: session.customerEmail,
        },
        visitNotes: visit.notes,
        devices,
        ticketNumber: ticketNumber ?? '',
      }),
    [session.customerName, session.customerPhone, session.customerEmail, visit.notes, devices, ticketNumber],
  );

  return (
    <aside className={KIOSK_UTILITY_SHEET} data-testid="kiosk-paperwork-panel">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sheets.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-text-soft">
            No paperwork yet
          </p>
        ) : (
          <div className="flex flex-col gap-4 p-3">
            {sheets.map((sheet) => (
              <RepairPaperworkCanvas key={sheet.lineId} align="full" frame="bordered">
                <RepairServiceForm
                  surface="screen"
                  density="compact"
                  sections="full"
                  dropoffSignatureUrl={visit.signatureDataUrl}
                  {...sheet.props}
                />
              </RepairPaperworkCanvas>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

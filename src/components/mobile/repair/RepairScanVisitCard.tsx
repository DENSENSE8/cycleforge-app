'use client';

/**
 * The counter visit a phone is joined to, as the hub's summary card: whose
 * visit (the cart's customer), how many units and how many still need a
 * serial, and which tablet it lives on. The whole card opens `/info`.
 *
 * Callers: `RepairScanCompanion` (`/m/repair-scan` card slot).
 * Schemas: `CompanionVisit`.
 */

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import type { CompanionVisit } from '@/lib/kiosk/companion-shape';

export function RepairScanVisitCard({ visit, href }: { visit: CompanionVisit; href: string }) {
  const total = visit.devices.length;
  const missing = visit.devices.filter((d) => !d.serialNumber.trim()).length;
  const customer = visit.cart?.customer?.trim() || 'Walk-in customer';
  return (
    <DetailSummaryCard
      href={href}
      ariaLabel="Visit details"
      title={customer}
      lines={[
        { text: `${total} ${total === 1 ? 'unit' : 'units'} · ${total - missing} with serials` },
        { text: visit.tablet ? `On ${visit.tablet}` : 'On the counter tablet', muted: true },
      ]}
      foot={visit.cart ? `Cart #${visit.cart.id}` : undefined}
      chip={
        total === 0
          ? null
          : missing === 0
            ? { label: 'Serials in', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
            : { label: `${missing} to scan`, className: 'border-amber-200 bg-amber-50 text-amber-800' }
      }
      chipFallback="No units yet"
    />
  );
}

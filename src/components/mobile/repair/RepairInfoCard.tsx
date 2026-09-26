'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { repairStatusBadgeClass, repairStatusOperatorLabel } from '@/lib/repair-status';
import { repairDeviceName } from '@/lib/repair/repair-device-name';

/**
 * The hub's summary card (operator 2026-09-24:
 * The hub's summary card (operator 2026-09-24: "simple when you first see it",
 */
export function RepairInfoCard({
  href,
  status,
  device,
  issue,
  serial,
  customer,
  phone,
}: {
  href: string;
  status: string | null;
  /** Stored listing title; the card shows its device part. */
  device: string;
  issue: string;
  serial: string;
  customer: string | null;
  phone: string | null;
}) {
  return (
    <DetailSummaryCard
      href={href}
      ariaLabel="Repair details"
      title={repairDeviceName(device) || 'No device title'}
      titleHint={device}
      lines={[
        { text: issue },
        { text: [customer, phone].filter(Boolean).join(' · '), muted: true },
      ]}
      foot={serial ? `SN ${serial}` : undefined}
      chip={status ? { label: repairStatusOperatorLabel(status), className: repairStatusBadgeClass(status) } : null}
      chipFallback="No status"
    />
  );
}

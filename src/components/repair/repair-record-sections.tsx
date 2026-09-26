'use client';

/** The repair record's right-column facts — ticket #, customer, links — split out of {@link RepairRecordView} like the order record's… */

import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { OrderNumberIdentity, TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { repairTicketValue } from '@/lib/tables/field-catalog/repair-resolve';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { formatPhoneNumber } from '@/utils/phone';
import { cn } from '@/utils/_cn';

/** One column of the record: the industrial panel its sections stack in. */
export const REPAIR_RECORD_COLUMN_CLASS = 'flex min-w-0 flex-col border border-mode-ink bg-mode-bar';

/** An in-record link: ruled underline, darkens on hover. */
export const REPAIR_RECORD_LINK_CLASS = cn(
  'underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink',
  focusRing('control'),
);

/** Ticket # — read-only; edited from the strip's "Edit ticket #" display. */
export function TicketFact({ repair }: { repair: RSRecord }) {
  const ticket = repairTicketValue(repair);
  return (
    <EvidenceFactRow label="Ticket #">
      <span
        data-testid="repair-record-ticket"
        className={cn(RECORD_ID_CLASS, 'block truncate select-all', ticket ? 'text-mode-ink' : 'text-mode-warn')}
      >
        {ticket || 'NONE'}
      </span>
    </EvidenceFactRow>
  );
}

export function CustomerFacts({ repair }: { repair: RSRecord }) {
  const { name, phone, email } = resolveRepairContact(repair);
  return (
    <div className="flex flex-col border-b border-mode-ink px-4" data-testid="repair-record-customer">
      <EvidenceFactRow label="Customer">
        <span className={cn('block truncate font-bold', !name && 'text-mode-warn')} title={name || undefined}>
          {name || 'Not provided'}
        </span>
      </EvidenceFactRow>
      {phone ? (
        <EvidenceFactRow label="Phone">
          <a href={`tel:${phone}`} className={cn(RECORD_ID_CLASS, REPAIR_RECORD_LINK_CLASS)}>
            {formatPhoneNumber(phone)}
          </a>
        </EvidenceFactRow>
      ) : null}
      {email ? (
        <EvidenceFactRow label="Email">
          <a href={`mailto:${email}`} title={email} className={cn('block truncate lowercase', REPAIR_RECORD_LINK_CLASS)}>
            {email}
          </a>
        </EvidenceFactRow>
      ) : null}
    </div>
  );
}

export function LinkFacts({ repair, zendeskUrl }: { repair: RSRecord; zendeskUrl: string | null }) {
  const order = String(repair.source_order_id ?? '').trim();
  const tracking = String(repair.source_tracking_number ?? '').trim();
  const serial = String(repair.serial_number ?? '').trim();
  const sku = String(repair.source_sku ?? '').trim();
  const none = <span className={cn(RECORD_ID_CLASS, 'text-mode-faint')}>—</span>;
  return (
    <div className="flex flex-col px-4" data-testid="repair-record-links">
      <EvidenceFactRow label="Order #">
        {order ? (
          <span className="flex min-w-0 items-center">
            <OrderNumberIdentity orderId={order} platformLabel={repair.source_system ?? null} openHref={marketplaceOrderUrl(order, repair.source_system)} />
          </span>
        ) : (
          <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>WALK-IN</span>
        )}
      </EvidenceFactRow>
      <EvidenceFactRow label="Inbound TRK#">
        {tracking ? (
          <span className="flex min-w-0 items-center">
            <TrackingIdentity tracking={tracking} />
          </span>
        ) : (
          none
        )}
      </EvidenceFactRow>
      <EvidenceFactRow label="Serial">
        {serial ? <span className={cn(RECORD_ID_CLASS, 'select-all')}>{serial}</span> : none}
      </EvidenceFactRow>
      <EvidenceFactRow label="SKU">
        {sku ? (
          <a
            href={`/inventory?sku=${encodeURIComponent(sku)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this SKU's stock"
            className={cn(RECORD_ID_CLASS, REPAIR_RECORD_LINK_CLASS)}
          >
            {sku} ↗
          </a>
        ) : (
          none
        )}
      </EvidenceFactRow>
      <EvidenceFactRow label="Zendesk">
        {zendeskUrl ? (
          <a href={zendeskUrl} target="_blank" rel="noopener noreferrer" className={cn(RECORD_ID_CLASS, REPAIR_RECORD_LINK_CLASS)}>
            #{repairTicketValue(repair)} ↗
          </a>
        ) : (
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>Not linked</span>
        )}
      </EvidenceFactRow>
    </div>
  );
}

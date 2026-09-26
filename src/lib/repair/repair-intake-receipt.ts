import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import { formatPhone } from '@/components/repair/repair-intake-logic';
import { joinSerials } from '@/lib/kiosk/serial-list';

export interface RepairReceiptProps {
  ticketNumber?: string | number;
  productTitle: string;
  issue: string;
  serialNumber: string;
  name: string;
  contact: string;
  price: string;
  startDateTime: string;
}

/** The customer facts a repair agreement states — the form's `customer` shape. */
export type RepairReceiptCustomer = RepairFormData['customer'];

/** Name + contact line, shared by every sheet so no two can format them apart. */
function receiptCustomerProps(customer: RepairReceiptCustomer): Pick<RepairReceiptProps, 'name' | 'contact'> {
  return {
    name: customer.name || '—',
    contact: [customer.phone ? formatPhone(customer.phone) : '', customer.email]
      .filter(Boolean)
      .join(', ') || '—',
  };
}

export function buildRepairIntakeReceiptProps(
  formData: RepairFormData,
  issueText: string,
  startDateTime: string,
  ticketNumber?: string | number,
): RepairReceiptProps {
  return {
    ticketNumber: ticketNumber ?? '',
    productTitle: formData.product.model || formData.product.type || '—',
    issue: issueText || '—',
    serialNumber: formData.serialNumber || '—',
    ...receiptCustomerProps(formData.customer),
    price: formData.price || '—',
    startDateTime,
  };
}

/**
 * The DEVICE facts a paperwork sheet states, per unit on the counter.
 *
 * Structural on purpose — `src/lib/kiosk/repair-devices.ts`'s
 * `KioskRepairDevice` satisfies it, so this module never imports the kiosk
 * cart to render one repair agreement.
 */
export interface RepairReceiptDevice {
  title: string;
  serialNumber: string;
  price: string;
}

/**
 * ONE device's paperwork, on a visit that may have several.
 *
 * The VISIT facts (customer, date, ticket) are shared — one drop-off, one
 * agreement, one signature — and `issueText` is the caller's per-unit issue
 * (on the kiosk, that unit's own reasons), because each unit becomes its own
 * `repair_service` row. The serial is EVERY serial on that unit (a Wave and
 * its CD changer), in the one stored form `joinSerials` writes.
 *
 * Kiosk caller: `repairPaperworkSheets` (`src/lib/kiosk/repair-paperwork-sheets.ts`).
 */
export function repairReceiptPropsForDevice(
  customer: RepairReceiptCustomer,
  device: RepairReceiptDevice,
  issueText: string,
  startDateTime: string,
  ticketNumber?: string | number,
): RepairReceiptProps {
  return {
    ticketNumber: ticketNumber ?? '',
    productTitle: device.title.trim() || '—',
    issue: issueText || '—',
    serialNumber: joinSerials([device.serialNumber]) || '—',
    ...receiptCustomerProps(customer),
    price: device.price.trim() || '—',
    startDateTime,
  };
}

import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import { formatPhone } from '@/components/repair/repair-intake-logic';

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
    name: formData.customer.name || '—',
    contact: [
      formData.customer.phone ? formatPhone(formData.customer.phone) : '',
      formData.customer.email,
    ]
      .filter(Boolean)
      .join(', ') || '—',
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
 * The VISIT facts (customer, issue, date, ticket) are shared — one drop-off,
 * one agreement, one signature — so they come from the same builder every
 * other caller uses. Only the three DEVICE facts are overridden, because each
 * unit becomes its own `repair_service` row with its own serial and quote.
 *
 * A single-device visit is byte-identical to {@link buildRepairIntakeReceiptProps}:
 * the device's title/serial/price ARE the form's, just read from the cart line
 * that will be written instead of from a flattened copy on the form.
 */
export function repairReceiptPropsForDevice(
  formData: RepairFormData,
  device: RepairReceiptDevice,
  issueText: string,
  startDateTime: string,
  ticketNumber?: string | number,
): RepairReceiptProps {
  return {
    ...buildRepairIntakeReceiptProps(formData, issueText, startDateTime, ticketNumber),
    productTitle: device.title.trim() || '—',
    serialNumber: device.serialNumber.trim() || '—',
    price: device.price.trim() || '—',
  };
}

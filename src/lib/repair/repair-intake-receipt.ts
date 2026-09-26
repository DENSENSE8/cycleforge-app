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

/** The DEVICE facts a paperwork sheet states, per unit on the counter. */
export interface RepairReceiptDevice {
  title: string;
  serialNumber: string;
  price: string;
}

/** ONE device's paperwork, on a visit that may have several. */
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

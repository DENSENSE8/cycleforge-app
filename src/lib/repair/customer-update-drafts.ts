/** Editable customer-update prefills for the mobile repair workbench. */

interface CustomerUpdateDraftContext {
  firstName: string;
  device: string;
  rsCode: string;
}

export function customerUpdateDraft(status: string | null, ctx: CustomerUpdateDraftContext): string {
  const greeting = `Hi ${ctx.firstName.trim() || 'there'},`;
  const device = ctx.device.trim() || 'repair';
  const subject = ctx.rsCode.trim() ? `your ${device} (${ctx.rsCode.trim()})` : `your ${device}`;

  let body: string;
  switch (status) {
    case 'Repaired, Contact Customer':
      body = `Good news: the work on ${subject} is finished. Please reply to this message or give us a call so we can arrange pickup and payment.`;
      break;
    case 'Awaiting Parts':
      body = `We're waiting on a part for ${subject}. We'll send you an update as soon as it arrives.`;
      break;
    case 'Awaiting Pickup':
      body = `${subject.charAt(0).toUpperCase()}${subject.slice(1)} is ready for pickup. Please bring your repair ticket or a photo ID when you come in.`;
      break;
    default:
      return '';
  }
  return `${greeting}\n\n${body}\n\nThank you!`;
}

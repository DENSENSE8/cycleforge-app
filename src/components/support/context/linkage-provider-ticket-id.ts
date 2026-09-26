/** One truthful provider-ticket id for Connections / LinkageStrip actions. */
import type { SupportContextBundle } from '@/lib/support/context-types';

export function resolveLinkageProviderTicketId(
  bundle: Pick<SupportContextBundle, 'ticket' | 'anchor'>,
): number | null {
  const fromTicket = bundle.ticket?.providerTicketId ?? null;
  if (fromTicket != null && Number.isFinite(fromTicket) && fromTicket > 0) {
    return fromTicket;
  }

  if (bundle.anchor.type !== 'ticket') return null;
  const raw = String(bundle.anchor.id ?? '')
    .trim()
    .replace(/^#/, '');
  if (!/^\d{1,12}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

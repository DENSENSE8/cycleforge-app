/**
 * Client-safe wire types for the Support Context Hub (no DB / server imports).
 */
import type { OrderLinkage } from '@/lib/order-linkage';
import type { ThreadConnection } from '@/lib/threads/types';
import type { TimelineItem } from '@/lib/timeline/types';

export interface SupportContextTicket {
  /** Internal registry id (support_tickets.id) — the operator PRIMARY `#`. */
  id: number;
  /** Provider-native display label (claims parity). Operator primary is `id`. */
  label: string;
  provider: string;
  externalTicketId: string | null;
  providerTicketId: number | null;
  /**
   * Runtime helpdesk provider display name for THIS ticket's provider (e.g.
   * "Zendesk"), resolved from the capability-label SoT — never hardcoded in a
   * view. Labels the "Open in <provider>" deep link + the secondary chip tooltip.
   */
  providerLabel: string;
  openUrl: string | null;
  subject: string | null;
  status: string | null;
}

export interface SupportContextThread {
  id: number;
  entityType: string;
  entityId: number;
  status: string;
}

export interface SupportContextLinkable {
  canLinkTicket: boolean;
  anchorType: 'serialUnit' | 'receiving' | 'tracking' | 'shipment' | 'order';
  anchorId: number;
  serialUnitId?: number | null;
  trackingNumber?: string | null;
  receivingId?: number | null;
  lineId?: number | null;
}

export interface SupportContextBundle {
  anchor: { type: string; id: number | string; label: string };
  linkage: OrderLinkage;
  ticket: SupportContextTicket | null;
  thread: SupportContextThread | null;
  connections: ThreadConnection[];
  timeline: TimelineItem[];
  linkable: SupportContextLinkable | null;
}

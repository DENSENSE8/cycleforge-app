/**
 * Client-safe wire types for the Support Context Hub (no DB / server imports).
 */
import type { OrderLinkage } from '@/lib/order-linkage';
import type { ThreadConnection } from '@/lib/threads/types';
import type { TimelineItem } from '@/lib/timeline/types';

export interface SupportContextTicket {
  id: number;
  label: string;
  provider: string;
  externalTicketId: string | null;
  providerTicketId: number | null;
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
  anchorType: 'receiving' | 'tracking' | 'shipment' | 'order';
  anchorId: number;
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

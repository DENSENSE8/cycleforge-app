import type { TimelineItem, TimelineTone } from './types';

/**
 * RMA authorization row (subset of `rma_authorizations` the order timeline
 * reads). Both customer returns (INBOUND_FROM_CUSTOMER) and vendor returns /
 * RTV (OUTBOUND_TO_VENDOR) live in that table.
 */
export interface RmaTimelineRow {
  id: number;
  rma_number: string;
  direction: string | null;
  status: string | null;
  authorized_at: string | null;
  closed_at: string | null;
  expected_carrier: string | null;
  notes: string | null;
  actor_name?: string | null;
}

/** Status → tone. Open states read as warnings; closed/received settle. */
function rmaTone(status: string | null | undefined): TimelineTone {
  switch ((status || '').toUpperCase()) {
    case 'CLOSED':
      return 'muted';
    case 'RECEIVED':
    case 'DISPOSITIONED':
      return 'success';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'danger';
    case 'AUTHORIZED':
      return 'warning';
    default:
      return 'info';
  }
}

function directionLabel(direction: string | null | undefined): string {
  switch ((direction || '').toUpperCase()) {
    case 'INBOUND_FROM_CUSTOMER':
      return 'Customer return';
    case 'OUTBOUND_TO_VENDOR':
      return 'Vendor return (RTV)';
    default:
      return 'Return';
  }
}

function statusLabel(status: string | null | undefined): string {
  const s = (status || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  if (!s) return 'authorized';
  return s;
}

/** Map RMA authorizations → timeline items. */
export function rmaEventsToTimeline(rows: RmaTimelineRow[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const r of rows) {
    const kind = directionLabel(r.direction);

    items.push({
      id: `rma-${r.id}`,
      at: r.authorized_at,
      title: `${kind} authorized`,
      tone: rmaTone(r.status),
      subtitle: [
        `Status ${statusLabel(r.status)}`,
        r.expected_carrier ? `via ${r.expected_carrier}` : null,
        r.notes?.trim() || null,
      ]
        .filter(Boolean)
        .join(' · '),
      ref: { value: r.rma_number, kind: 'id' },
      actor: r.actor_name || undefined,
      sourceEventType: 'RMA_AUTHORIZED',
    });

    if (r.closed_at) {
      items.push({
        id: `rma-${r.id}-closed`,
        at: r.closed_at,
        title: `${kind} closed`,
        tone: 'muted',
        subtitle: `Final status ${statusLabel(r.status)}`,
        ref: { value: r.rma_number, kind: 'id' },
        sourceEventType: 'RMA_CLOSED',
      });
    }
  }

  return items;
}

/**
 * The stored half of a fulfilled order's thread (`./fulfilled-thread.ts`):
 * the staff notes on the order's lines and the desk's events on them, read
 * under the tenant in one round trip each.
 */

import { FULFILLED_DESK_EVENT_TYPES, type FulfilledDeskEvent, type FulfilledThreadRead } from '@/lib/outbound/fulfilled-thread';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

const NOTES_SQL = `
  SELECT n.id::text AS id, n.order_id, n.note_text, n.created_at, s.name AS author
    FROM order_notes n
    LEFT JOIN staff s ON s.id = n.author_staff_id
   WHERE n.order_id = ANY($1::int[])
   ORDER BY n.created_at ASC`;

const EVENTS_SQL = `
  SELECT e.id::text AS id, e.entity_id, e.event_type, e.occurred_at, e.payload, s.name AS actor
    FROM ops_events e
    LEFT JOIN staff s ON s.id = e.actor_staff_id
   WHERE e.entity_type = 'order'
     AND e.entity_id = ANY($1::bigint[])
     AND e.event_type = ANY($2::text[])
   ORDER BY e.occurred_at ASC`;

const iso = (value: unknown): string => new Date(value as string | Date).toISOString();

export async function readFulfilledThread(orgId: OrgId, orderRowIds: readonly number[]): Promise<FulfilledThreadRead> {
  const [notes, events] = await Promise.all([
    tenantQuery(orgId, NOTES_SQL, [orderRowIds]),
    tenantQuery(orgId, EVENTS_SQL, [orderRowIds, FULFILLED_DESK_EVENT_TYPES]),
  ]);
  return {
    notes: notes.rows.map((row) => ({
      id: String(row.id),
      orderRowId: Number(row.order_id),
      text: String(row.note_text),
      authorName: row.author == null ? null : String(row.author),
      at: iso(row.created_at),
    })),
    events: events.rows.map((row) => ({
      id: String(row.id),
      orderRowId: Number(row.entity_id),
      type: String(row.event_type) as FulfilledDeskEvent,
      actorName: row.actor == null ? null : String(row.actor),
      at: iso(row.occurred_at),
      payload: row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {},
    })),
  };
}

/** Read-side "connecting dots" for a thread — the derivable related entities (order → tracking / serials / SKU; repair → serial → order)… */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveEntity } from '@/lib/operations/journey';
import { listThreadLinks } from './thread-links';
import type { ThreadConnection } from './types';
import { supportHref } from '@/lib/nav/route-tree';

interface ThreadAnchor {
  entityType: string;
  entityId: number;
}

function orderHref(orderId: number): string {
  return `/search?sel=order:${encodeURIComponent(String(orderId))}`;
}

/**
 * Resolve the connections (dots) for a thread. Derived dots come from the
 * journey anchor engine (order↔serial↔tracking↔sku); curated dots come from
 * thread_links. Deduped by (entityType, entityId|label).
 */
export async function resolveThreadConnections(
  orgId: OrgId,
  anchor: ThreadAnchor,
): Promise<ThreadConnection[]> {
  const out: ThreadConnection[] = [];
  const seen = new Set<string>();
  const push = (c: ThreadConnection) => {
    const key = `${c.entityType}:${c.entityId ?? c.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  /** The thread's linked support ticket, resolved over a precedence-ordered list of (entity_type, entity_id) candidates — the FIRST candidate… */
  const pushLinkedTicket = async (
    client: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
    candidates: Array<{ entityType: string; entityId: number }>,
  ) => {
    const usable = candidates.filter((c) => Number.isFinite(c.entityId));
    if (usable.length === 0) return;
    const ticket = await client.query<{
      support_ticket_id: string | null;
      zendesk_ticket_id: string | null;
      external_ticket_id: string | null;
      provider: string | null;
    }>(
      `SELECT tl.support_ticket_id, tl.zendesk_ticket_id,
              st.external_ticket_id, st.provider
         FROM ticket_links tl
         JOIN unnest($2::text[], $3::bigint[]) WITH ORDINALITY AS c(etype, eid, ord)
           ON tl.entity_type = c.etype AND tl.entity_id = c.eid
         LEFT JOIN support_tickets st ON st.id = tl.support_ticket_id
        WHERE tl.organization_id = $1::uuid
        ORDER BY c.ord, tl.is_primary DESC, tl.created_at DESC
        LIMIT 1`,
      [orgId, usable.map((c) => c.entityType), usable.map((c) => c.entityId)],
    );
    const trow = ticket.rows[0];
    if (!trow) return;
    const ext =
      trow.external_ticket_id?.trim() ||
      (trow.zendesk_ticket_id != null ? String(trow.zendesk_ticket_id) : null);
    const label = ext ? `#${ext.replace(/^#/, '')}` : null;
    if (!label) return;
    push({
      entityType: 'SUPPORT_TICKET',
      entityId: trow.support_ticket_id != null ? Number(trow.support_ticket_id) : null,
      label,
      origin: 'derived',
      hint: 'ticket',
      href:
        trow.support_ticket_id != null
          ? supportHref({ item: Number(trow.support_ticket_id) })
          : trow.provider === 'zendesk' && ext
            ? supportHref({ q: ext })
            : null,
    });
  };

  await withTenantTransaction(orgId, async (client) => {
    // ── Derived dots ──────────────────────────────────────────────────────
    // ORDER anchor → order number + tracking + serials + SKU.
    if (anchor.entityType === 'ORDER') {
      const a = await resolveEntity(client, orgId, 'order', String(anchor.entityId));
      if (a) {
        for (const t of a.trackingNumbers) {
          push({ entityType: 'TRACKING', entityId: null, label: t, origin: 'derived', hint: 'tracking' });
        }
        a.serialUnitIds.forEach((sid, i) => {
          push({
            entityType: 'SERIAL_UNIT',
            entityId: sid,
            label: a.serials[i] ?? `unit ${sid}`,
            origin: 'derived',
          });
        });
      }
      // SKU (denormalized on the order row; resolve the stable catalog id).
      const sku = await client.query<{ sku_catalog_id: number | null; sku: string | null }>(
        `SELECT sku_catalog_id, sku FROM orders WHERE id = $1::int AND organization_id = $2::uuid`,
        [anchor.entityId, orgId],
      );
      if (sku.rows[0]?.sku) {
        push({
          entityType: 'SKU',
          entityId: sku.rows[0].sku_catalog_id ?? null,
          label: sku.rows[0].sku,
          origin: 'derived',
          hint: 'sku',
        });
      }

      // Linked support ticket.
      const stns = await client.query<{ shipment_id: string }>(
        `SELECT shipment_id FROM shipment_links
          WHERE organization_id = $1::uuid AND owner_type = 'ORDER' AND owner_id = $2::int
          ORDER BY is_primary DESC, box_seq ASC`,
        [orgId, anchor.entityId],
      );
      await pushLinkedTicket(client, [
        { entityType: 'ORDER', entityId: Number(anchor.entityId) },
        ...stns.rows.map((r) => ({ entityType: 'SHIPMENT', entityId: Number(r.shipment_id) })),
      ]);
    }

    // REPAIR anchor → its serial (→ order), plus the free-text source refs.
    if (anchor.entityType === 'REPAIR') {
      const r = await client.query<{
        serial_unit_id: number | null;
        source_order_id: string | null;
        source_tracking_number: string | null;
        source_sku: string | null;
      }>(
        `SELECT serial_unit_id, source_order_id, source_tracking_number, source_sku
           FROM repair_service WHERE id = $1::int AND organization_id = $2::uuid`,
        [anchor.entityId, orgId],
      );
      const row = r.rows[0];
      if (row) {
        if (row.serial_unit_id != null) {
          const su = await client.query<{ serial_number: string | null }>(
            `SELECT serial_number FROM serial_units WHERE id = $1::int AND organization_id = $2::uuid`,
            [row.serial_unit_id, orgId],
          );
          push({
            entityType: 'SERIAL_UNIT',
            entityId: row.serial_unit_id,
            label: su.rows[0]?.serial_number ?? `unit ${row.serial_unit_id}`,
            origin: 'derived',
          });
        }
        // source_* are free text (no FK) — surface as hints so the operator can
        // jump, but never treated as a hard entity id.
        if (row.source_order_id) {
          const o = await client.query<{ id: number }>(
            `SELECT id FROM orders WHERE organization_id = $1::uuid AND order_id = $2 LIMIT 1`,
            [orgId, row.source_order_id],
          );
          push({
            entityType: 'ORDER',
            entityId: o.rows[0]?.id ?? null,
            label: row.source_order_id,
            origin: 'derived',
            href: o.rows[0]?.id != null ? orderHref(o.rows[0].id) : null,
          });
        }
        if (row.source_tracking_number) {
          push({ entityType: 'TRACKING', entityId: null, label: row.source_tracking_number, origin: 'derived', hint: 'tracking' });
        }
        if (row.source_sku) {
          push({ entityType: 'SKU', entityId: null, label: row.source_sku, origin: 'derived', hint: 'sku' });
        }
      }
    }

    // SERIAL_UNIT anchor → its allocated order (+ that order's tracking).
    if (anchor.entityType === 'SERIAL_UNIT') {
      const alloc = await client.query<{ order_id: number | null }>(
        `SELECT order_id FROM order_unit_allocations
          WHERE serial_unit_id = $1::int AND organization_id = $2::uuid
          ORDER BY id DESC LIMIT 1`,
        [anchor.entityId, orgId],
      );
      const orderId = alloc.rows[0]?.order_id ?? null;
      if (orderId != null) {
        const o = await client.query<{ order_id: string | null }>(
          `SELECT order_id FROM orders WHERE id = $1::int AND organization_id = $2::uuid`,
          [orderId, orgId],
        );
        push({
          entityType: 'ORDER',
          entityId: orderId,
          label: o.rows[0]?.order_id ?? `order ${orderId}`,
          origin: 'derived',
          href: orderHref(orderId),
        });
      }
    }

    // RECEIVING / RECEIVING_LINE → tracking (via carton.shipment_id → STN),
    // SKU on the line, and the linked support ticket.
    if (anchor.entityType === 'RECEIVING' || anchor.entityType === 'RECEIVING_LINE') {
      let receivingId: number | null =
        anchor.entityType === 'RECEIVING' ? anchor.entityId : null;
      let lineId: number | null =
        anchor.entityType === 'RECEIVING_LINE' ? anchor.entityId : null;

      if (lineId != null) {
        const line = await client.query<{
          receiving_id: number | null;
          sku: string | null;
        }>(
          `SELECT receiving_id, sku FROM receiving_line
            WHERE id = $1::int AND organization_id = $2::uuid LIMIT 1`,
          [lineId, orgId],
        );
        if (line.rows[0]?.receiving_id != null) {
          receivingId = Number(line.rows[0].receiving_id);
        }
        if (line.rows[0]?.sku) {
          push({
            entityType: 'SKU',
            entityId: null,
            label: line.rows[0].sku,
            origin: 'derived',
            hint: 'sku',
          });
        }
      }

      if (receivingId != null) {
        const carton = await client.query<{
          shipment_id: number | null;
          tracking: string | null;
        }>(
          `SELECT r.shipment_id, stn.tracking_number_raw AS tracking
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
            WHERE r.id = $1::int AND r.organization_id = $2::uuid
            LIMIT 1`,
          [receivingId, orgId],
        );
        const tracking = carton.rows[0]?.tracking?.trim();
        if (tracking) {
          push({
            entityType: 'TRACKING',
            entityId: carton.rows[0]?.shipment_id != null
              ? Number(carton.rows[0].shipment_id)
              : null,
            label: tracking,
            origin: 'derived',
            hint: 'tracking',
          });
        }

        // Linked ticket via ticket_links on line / carton / SHIPMENT — same
        // precedence as before (line > carton > shipment), now through the
        // shared helper the ORDER branch also uses.
        const cartonShipmentId =
          carton.rows[0]?.shipment_id != null ? Number(carton.rows[0].shipment_id) : null;
        await pushLinkedTicket(client, [
          ...(lineId != null ? [{ entityType: 'RECEIVING_LINE', entityId: Number(lineId) }] : []),
          { entityType: 'RECEIVING', entityId: Number(receivingId) },
          ...(cartonShipmentId != null
            ? [{ entityType: 'SHIPMENT', entityId: cartonShipmentId }]
            : []),
        ]);
      }
    }
  });

  // ── Curated dots (thread_links) — resolve the thread id first ────────────
  // (Only when we can find the thread; callers usually pass the thread's own id
  // separately, so we accept the anchor here and let the route pass links in.)

  return out;
}

/**
 * Merge curated thread_links into the connection list (best-effort labels).
 * Kept separate so a route can resolve derived dots + curated links in one place.
 */
export async function resolveThreadLinksAsConnections(
  orgId: OrgId,
  threadId: number,
): Promise<ThreadConnection[]> {
  const links = await listThreadLinks(orgId, threadId);
  return links.map((l) => ({
    entityType: l.entityType,
    entityId: l.entityId,
    label: l.label ?? `${l.entityType.toLowerCase().replace(/_/g, ' ')} #${l.entityId}`,
    origin: 'link' as const,
    href: l.entityType === 'ORDER' ? orderHref(l.entityId) : null,
  }));
}

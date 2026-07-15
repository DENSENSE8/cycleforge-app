/**
 * Read-side "connecting dots" for a thread — the derivable related entities
 * (order → tracking / serials / SKU; repair → serial → order) resolved at read
 * time via the existing journey anchor engine, merged with any curated
 * thread_links (manual connections). No new linkage is persisted here; this is
 * the cheap, always-current view the deep-scan recommended (option A) over a
 * denormalized link row for derivable facts.
 *
 * Server-only (imports the journey resolver + tenant db). Org-scoped throughout:
 * every query filters organization_id, and tracking is only ever reached through
 * an org-owned order (never a raw STN probe).
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveEntity } from '@/lib/operations/journey';
import { listThreadLinks } from './thread-links';
import type { ThreadConnection } from './types';

interface ThreadAnchor {
  entityType: string;
  entityId: number;
}

function orderHref(orderId: number): string {
  return `/o/${orderId}`;
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

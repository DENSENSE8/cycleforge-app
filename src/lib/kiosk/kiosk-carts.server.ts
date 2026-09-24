import 'server-only';

/**
 * Recent carts — the counter's ONE kiosk cart, persisted per org so several
 * customers can be juggled at once and any paired tablet can pick a cart up by
 * its `#id`.
 *
 * ## Single writer
 *
 * A cart is saved by exactly one tablet: `held_by_device_id`. Opening it on
 * another tablet MOVES the hold (and bumps `version`), so the previous holder's
 * next save is refused with `held_elsewhere` and that tablet lets go of it.
 * That is the whole conflict model — no merge. Two staffers editing one basket
 * at once is a mistake to surface, not a state to reconcile.
 *
 * The list columns (`label`, `item_count`, `total_cents`) are derived HERE from
 * the validated snapshot on every write, never taken from the client, so a list
 * row cannot disagree with the cart it opens.
 *
 * Every query is org-scoped under the tenant GUC (`withTenantTransaction` /
 * `tenantQuery`) and stamps the org + device from `withKioskAuth`'s context,
 * never the request.
 *
 * Callers: `/api/kiosk/carts` (list, create), `/api/kiosk/carts/[id]` (save,
 * clear), `/api/kiosk/carts/[id]/open`, `/api/kiosk/carts/[id]/done`.
 * Schema: `kiosk_carts` (2026-09-24d). Snapshot shape: `kiosk-cart-snapshot.ts`.
 * User 2026-09-24: "recent carts for juggling multiple customers at the same
 * time, IDed for multiple devices".
 */

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { cartMoneySplit, cartUnitCount } from './cart-money';
import { cartListLabel, parseKioskCartSnapshot, type KioskCartSnapshot } from './kiosk-cart-snapshot';

/** A cart untouched for a day is yesterday's walk-in, not one being juggled. */
const LIST_WINDOW = '24 hours';
const LIST_CAP = 30;

export interface KioskCartSummary {
  id: number;
  label: string | null;
  itemCount: number;
  totalCents: number;
  updatedAt: string;
  /** This tablet holds it — the list says "on this tablet" vs "on another device". */
  heldHere: boolean;
}

export type KioskCartWriteFailure = 'not_found' | 'held_elsewhere' | 'stale_version';

function listColumns(snapshot: KioskCartSnapshot) {
  return {
    label: cartListLabel(snapshot),
    itemCount: cartUnitCount(snapshot.lines),
    totalCents: cartMoneySplit(snapshot.lines).totalCents,
  };
}

export async function listOpenKioskCarts(
  orgId: OrgId,
  deviceId: number,
): Promise<KioskCartSummary[]> {
  const res = await tenantQuery<{
    id: string;
    label: string | null;
    item_count: number;
    total_cents: string;
    updated_at: Date;
    held_here: boolean;
  }>(
    orgId,
    // The holder test is SQL's, not JS's: `kiosk_devices.id` is a BIGINT, and
    // the device id on the auth context can arrive as a string at runtime, so
    // a JS `===` would call every cart "on another device".
    `SELECT id, label, item_count, total_cents, updated_at,
            COALESCE(held_by_device_id = $2, false) AS held_here
       FROM kiosk_carts
      WHERE organization_id = $1 AND status = 'open'
        AND updated_at > NOW() - INTERVAL '${LIST_WINDOW}'
      ORDER BY updated_at DESC
      LIMIT ${LIST_CAP}`,
    [orgId, deviceId],
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    label: row.label,
    itemCount: row.item_count,
    totalCents: Number(row.total_cents),
    updatedAt: new Date(row.updated_at).toISOString(),
    heldHere: row.held_here,
  }));
}

export async function createKioskCart(
  orgId: OrgId,
  deviceId: number,
  snapshot: KioskCartSnapshot,
): Promise<{ id: number; version: number }> {
  const cols = listColumns(snapshot);
  const res = await tenantQuery<{ id: string; version: number }>(
    orgId,
    `INSERT INTO kiosk_carts
       (organization_id, held_by_device_id, snapshot, label, item_count, total_cents)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id, version`,
    [orgId, deviceId, JSON.stringify(snapshot), cols.label, cols.itemCount, cols.totalCents],
  );
  const row = res.rows[0];
  return { id: Number(row.id), version: row.version };
}

/**
 * Lock an OPEN cart and say why this tablet may not write it, if it may not.
 * Shared by every holder-only write so the refusal reasons cannot drift apart.
 */
async function lockHeldCart(
  client: PoolClient,
  orgId: OrgId,
  deviceId: number,
  id: number,
): Promise<{ ok: true; version: number } | { ok: false; reason: KioskCartWriteFailure }> {
  const found = await client.query<{ held_here: boolean; version: number }>(
    `SELECT COALESCE(held_by_device_id = $3, false) AS held_here, version FROM kiosk_carts
      WHERE organization_id = $1 AND id = $2 AND status = 'open'
      FOR UPDATE`,
    [orgId, id, deviceId],
  );
  const row = found.rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  // Compared in SQL for the same BIGINT-vs-string reason as the list.
  if (!row.held_here) return { ok: false, reason: 'held_elsewhere' };
  return { ok: true, version: row.version };
}

export async function saveKioskCart(
  orgId: OrgId,
  deviceId: number,
  id: number,
  expectedVersion: number,
  snapshot: KioskCartSnapshot,
): Promise<{ ok: true; version: number } | { ok: false; reason: KioskCartWriteFailure }> {
  return withTenantTransaction(orgId, async (client) => {
    const held = await lockHeldCart(client, orgId, deviceId, id);
    if (!held.ok) return held;
    if (held.version !== expectedVersion) return { ok: false, reason: 'stale_version' } as const;
    const cols = listColumns(snapshot);
    const res = await client.query<{ version: number }>(
      `UPDATE kiosk_carts
          SET snapshot = $3::jsonb, label = $4, item_count = $5, total_cents = $6,
              version = version + 1, updated_at = NOW()
        WHERE organization_id = $1 AND id = $2
        RETURNING version`,
      [orgId, id, JSON.stringify(snapshot), cols.label, cols.itemCount, cols.totalCents],
    );
    return { ok: true, version: res.rows[0].version } as const;
  });
}

/**
 * Take the hold for this tablet and hand back the cart. The version bump is
 * what retires the previous holder: its in-flight save now fails either check.
 * `null` → no such open cart, or a stored snapshot that no longer parses (a
 * cart that cannot be shown faithfully is not opened half-way).
 */
export async function openKioskCart(
  orgId: OrgId,
  deviceId: number,
  id: number,
): Promise<{ id: number; version: number; snapshot: KioskCartSnapshot } | null> {
  const res = await tenantQuery<{ version: number; snapshot: unknown }>(
    orgId,
    `UPDATE kiosk_carts
        SET held_by_device_id = $3, version = version + 1, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND status = 'open'
      RETURNING version, snapshot`,
    [orgId, id, deviceId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const snapshot = parseKioskCartSnapshot(row.snapshot);
  return snapshot ? { id, version: row.version, snapshot } : null;
}

/** Clear cart: the basket is abandoned, so the row goes — there is nothing to recall. */
export async function deleteKioskCart(
  orgId: OrgId,
  deviceId: number,
  id: number,
): Promise<{ ok: true } | { ok: false; reason: KioskCartWriteFailure }> {
  return withTenantTransaction(orgId, async (client) => {
    const held = await lockHeldCart(client, orgId, deviceId, id);
    if (!held.ok) return held;
    await client.query(`DELETE FROM kiosk_carts WHERE organization_id = $1 AND id = $2`, [
      orgId,
      id,
    ]);
    return { ok: true } as const;
  });
}

/**
 * The visit was submitted: close the cart so no tablet can reopen and submit
 * it a second time. Kept (as `done`) rather than deleted — it is the record of
 * which cart became which visit while the counter is still busy.
 */
export async function completeKioskCart(
  orgId: OrgId,
  deviceId: number,
  id: number,
): Promise<{ ok: true } | { ok: false; reason: KioskCartWriteFailure }> {
  return withTenantTransaction(orgId, async (client) => {
    const held = await lockHeldCart(client, orgId, deviceId, id);
    if (!held.ok) return held;
    await client.query(
      `UPDATE kiosk_carts SET status = 'done', version = version + 1, updated_at = NOW()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, id],
    );
    return { ok: true } as const;
  });
}

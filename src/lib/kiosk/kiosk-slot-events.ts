/**
 * Gate preamble (Fact-Forcing):
 * Importers/callers: src/app/api/kiosk/slot-events/route.ts (GET list);
 * future kiosk runtime via insertKioskSlotEvent.
 * Affected API: listKioskSlotEvents, insertKioskSlotEvent — org-scoped tenant TX.
 * Data schemas: KioskSlotEventTableRow; table kiosk_slot_events
 * (2026-09-11_kiosk_slot_events.sql).
 * User instruction (verbatim): Continue to the next phase
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  KioskSlotEventTableRow,
  KioskSlotHardwareSnapshot,
} from '@/lib/kiosk/kiosk-slot-event-row';

export interface InsertKioskSlotEventInput {
  kioskDeviceId: number;
  slotKey: string;
  fromState: string;
  toState: string;
  dwellMs?: number | null;
  hardwareStatus?: KioskSlotHardwareSnapshot | null;
  occurredAt?: string | null;
  payload?: Readonly<Record<string, unknown>>;
}

function mapRow(row: {
  id: number | string;
  organization_id: string;
  kiosk_device_id: number | string;
  device_label: string | null;
  slot_key: string;
  from_state: string;
  to_state: string;
  dwell_ms: number | null;
  hardware_status: string | null;
  occurred_at: Date;
  payload: unknown;
}): KioskSlotEventTableRow {
  return {
    id: Number(row.id),
    organizationId: row.organization_id,
    kioskDeviceId: Number(row.kiosk_device_id),
    deviceLabel: String(row.device_label ?? '').trim() || null,
    slotKey: row.slot_key,
    fromState: row.from_state,
    toState: row.to_state,
    dwellMs: row.dwell_ms == null ? null : Number(row.dwell_ms),
    hardwareStatus: (row.hardware_status as KioskSlotHardwareSnapshot | null) ?? null,
    occurredAt: row.occurred_at.toISOString(),
    payload:
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
  };
}

/** Newest-first org feed for Settings › Devices history pane. */
export async function listKioskSlotEvents(
  orgId: OrgId,
  limit = 200,
): Promise<KioskSlotEventTableRow[]> {
  const capped = Math.min(Math.max(limit, 1), 500);
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `SELECT e.id, e.organization_id, e.kiosk_device_id, d.label AS device_label,
              e.slot_key, e.from_state, e.to_state, e.dwell_ms, e.hardware_status,
              e.occurred_at, e.payload
         FROM kiosk_slot_events e
         LEFT JOIN kiosk_devices d
           ON d.id = e.kiosk_device_id
          AND d.organization_id = e.organization_id
        WHERE e.organization_id = $1
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $2`,
      [orgId, capped],
    );
    return (r.rows as Parameters<typeof mapRow>[0][]).map(mapRow);
  });
}

/** Runtime emit waist — lane transitions call this; never a Revoke path. */
export async function insertKioskSlotEvent(
  orgId: OrgId,
  input: InsertKioskSlotEventInput,
): Promise<KioskSlotEventTableRow> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO kiosk_slot_events (
         organization_id, kiosk_device_id, slot_key, from_state, to_state,
         dwell_ms, hardware_status, occurred_at, payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         COALESCE($8::timestamptz, now()), COALESCE($9::jsonb, '{}'::jsonb)
       )
       RETURNING id, organization_id, kiosk_device_id, slot_key, from_state, to_state,
                 dwell_ms, hardware_status, occurred_at, payload`,
      [
        orgId,
        input.kioskDeviceId,
        input.slotKey,
        input.fromState,
        input.toState,
        input.dwellMs ?? null,
        input.hardwareStatus ?? null,
        input.occurredAt ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    const inserted = r.rows[0] as Omit<Parameters<typeof mapRow>[0], 'device_label'>;
    const label = await client.query(
      `SELECT label FROM kiosk_devices WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [input.kioskDeviceId, orgId],
    );
    return mapRow({
      ...inserted,
      device_label: (label.rows[0] as { label?: string } | undefined)?.label ?? null,
    });
  });
}

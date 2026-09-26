/** Correcting a SUBMITTED counter visit from the tablet's History face. */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const KIOSK_VISIT_EDITABLE_CUSTOMER_FIELDS = ['name', 'phone', 'email'] as const;
export const KIOSK_VISIT_EDITABLE_DEVICE_FIELDS = ['serialNumber', 'issue', 'notes'] as const;

export type KioskVisitCustomerField = (typeof KIOSK_VISIT_EDITABLE_CUSTOMER_FIELDS)[number];
export type KioskVisitDeviceField = (typeof KIOSK_VISIT_EDITABLE_DEVICE_FIELDS)[number];

/** Every editable path, dotted, for the 403 body and for the tests. */
export const KIOSK_VISIT_EDITABLE_FIELDS: ReadonlyArray<string> = [
  ...KIOSK_VISIT_EDITABLE_CUSTOMER_FIELDS.map((f) => `customer.${f}`),
  ...KIOSK_VISIT_EDITABLE_DEVICE_FIELDS.map((f) => `devices[].${f}`),
];

export interface KioskVisitCustomerEdit {
  name?: string;
  phone?: string;
  email?: string;
}

export interface KioskVisitDeviceEdit {
  repairId: number;
  serialNumber?: string;
  issue?: string;
  notes?: string;
}

export interface KioskVisitEdit {
  customer?: KioskVisitCustomerEdit;
  devices?: KioskVisitDeviceEdit[];
}

/** Envelope keys the route itself owns — not edit payload, not a rejection. */
const ENVELOPE_KEYS: Record<string, true> = { staffId: true, pin: true, customer: true, devices: true };
const DEVICE_KEYS: Record<string, true> = {
  repairId: true,
  serialNumber: true,
  issue: true,
  notes: true,
};
const CUSTOMER_KEYS: Record<string, true> = { name: true, phone: true, email: true };

/**
 * Every dotted path in `raw` that this surface refuses to write. Pure, so the
 * refusal is unit-testable without a request or a database.
 */
export function collectDisallowedEditFields(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const rejected: string[] = [];

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!ENVELOPE_KEYS[key]) rejected.push(key);
  }

  const customer = (raw as { customer?: unknown }).customer;
  if (customer && typeof customer === 'object') {
    for (const key of Object.keys(customer as Record<string, unknown>)) {
      if (!CUSTOMER_KEYS[key]) rejected.push(`customer.${key}`);
    }
  }

  const devices = (raw as { devices?: unknown }).devices;
  if (Array.isArray(devices)) {
    for (const [index, device] of devices.entries()) {
      if (!device || typeof device !== 'object') continue;
      for (const key of Object.keys(device as Record<string, unknown>)) {
        if (!DEVICE_KEYS[key]) rejected.push(`devices[${index}].${key}`);
      }
    }
  }

  return rejected;
}

export interface KioskVisitEditSnapshot {
  customer: { id: number; name: string | null; phone: string | null; email: string | null } | null;
  devices: Array<{
    repairId: number;
    serialNumber: string | null;
    issue: string | null;
    notes: string | null;
  }>;
}

export type KioskVisitEditResult =
  | {
      ok: true;
      /** Dotted paths that actually changed — empty means the edit was a no-op. */
      changed: string[];
      before: KioskVisitEditSnapshot;
      after: KioskVisitEditSnapshot;
    }
  | { ok: false; reason: 'not_found' | 'device_not_in_visit' | 'phone_conflict' };

interface VisitRow {
  id: number;
  customer_id: number | null;
}

interface CustomerRow {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
}

interface DeviceRow {
  id: number;
  serial_number: string | null;
  issue: string | null;
  notes: string | null;
}

const CUSTOMER_SELECT = `SELECT id,
       COALESCE(
         NULLIF(display_name, ''),
         NULLIF(customer_name, ''),
         NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
       ) AS name,
       phone,
       email
  FROM customers
 WHERE organization_id = $1 AND id = $2
 LIMIT 1`;

async function readDevices(
  client: PoolClient,
  orgId: OrgId,
  visitId: number,
): Promise<DeviceRow[]> {
  const res = await client.query<DeviceRow>(
    `SELECT id, serial_number, issue, notes
       FROM repair_service
      WHERE organization_id = $1 AND counter_transaction_id = $2
      ORDER BY created_at ASC NULLS LAST, id ASC`,
    [orgId, visitId],
  );
  return res.rows;
}

function snapshot(customer: CustomerRow | null, devices: DeviceRow[]): KioskVisitEditSnapshot {
  return {
    customer: customer
      ? { id: Number(customer.id), name: customer.name, phone: customer.phone, email: customer.email }
      : null,
    devices: devices.map((d) => ({
      repairId: Number(d.id),
      serialNumber: d.serial_number,
      issue: d.issue,
      notes: d.notes,
    })),
  };
}

/** Trim, and treat an emptied field as an explicit clear (NULL), not as "unchanged". */
function normalizeText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function lastTenDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 10 ? digits : digits.slice(-10);
}

export async function applyKioskVisitEdit(
  orgId: OrgId,
  visitId: number,
  edit: KioskVisitEdit,
): Promise<KioskVisitEditResult> {
  return withTenantTransaction(orgId, async (client) => {
    const visitRes = await client.query<VisitRow>(
      `SELECT id, customer_id
         FROM counter_transactions
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE`,
      [orgId, visitId],
    );
    const visit = visitRes.rows[0];
    if (!visit) return { ok: false as const, reason: 'not_found' as const };

    const customerBeforeRes = visit.customer_id
      ? await client.query<CustomerRow>(CUSTOMER_SELECT, [orgId, visit.customer_id])
      : null;
    const customerBefore = customerBeforeRes?.rows[0] ?? null;
    const devicesBefore = await readDevices(client, orgId, visitId);
    const before = snapshot(customerBefore, devicesBefore);

    const changed: string[] = [];

    // ── Devices ──────────────────────────────────────────────────────────────
    for (const device of edit.devices ?? []) {
      const current = devicesBefore.find((d) => Number(d.id) === device.repairId);
      // A repair id that is not one of THIS visit's devices is a cross-visit
      // write attempt, not a typo to absorb.
      if (!current) return { ok: false as const, reason: 'device_not_in_visit' as const };

      const serial = normalizeText(device.serialNumber);
      const issue = normalizeText(device.issue);
      const notes = normalizeText(device.notes);

      const sets: string[] = [];
      const params: unknown[] = [orgId, device.repairId];
      if (serial !== undefined && serial !== current.serial_number) {
        params.push(serial);
        sets.push(`serial_number = $${params.length}`);
        changed.push(`devices[${device.repairId}].serialNumber`);
      }
      if (issue !== undefined && issue !== current.issue) {
        params.push(issue);
        sets.push(`issue = $${params.length}`);
        changed.push(`devices[${device.repairId}].issue`);
      }
      if (notes !== undefined && notes !== current.notes) {
        params.push(notes);
        sets.push(`notes = $${params.length}`);
        changed.push(`devices[${device.repairId}].notes`);
      }
      if (sets.length === 0) continue;

      await client.query(
        `UPDATE repair_service
            SET ${sets.join(', ')}, updated_at = NOW()
          WHERE organization_id = $1 AND id = $2`,
        params,
      );
    }

    // ── Customer ─────────────────────────────────────────────────────────────
    if (edit.customer && customerBefore) {
      const name = normalizeText(edit.customer.name);
      const phone = normalizeText(edit.customer.phone);
      const email = normalizeText(edit.customer.email);

      if (phone && phone !== customerBefore.phone) {
        const digits = lastTenDigits(phone);
        if (digits.length >= 7) {
          const clash = await client.query<{ id: number }>(
            `SELECT id
               FROM customers
              WHERE organization_id = $1
                AND id <> $2
                AND phone IS NOT NULL
                AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $3
              LIMIT 1`,
            [orgId, customerBefore.id, digits],
          );
          if (clash.rows[0]) return { ok: false as const, reason: 'phone_conflict' as const };
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [orgId, customerBefore.id];
      if (name !== undefined && name !== customerBefore.name) {
        // Mirror `createRepairCustomer`: the counter writes the whole name into
        // both display columns plus the split pair, so every reader that picks
        // a different one of the four agrees.
        const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
        params.push(name, name, parts[0] ?? '', parts.slice(1).join(' '));
        sets.push(
          `customer_name = $${params.length - 3}`,
          `display_name = $${params.length - 2}`,
          `first_name = $${params.length - 1}`,
          `last_name = $${params.length}`,
        );
        changed.push('customer.name');
      }
      if (phone !== undefined && phone !== customerBefore.phone) {
        params.push(phone);
        sets.push(`phone = $${params.length}`);
        changed.push('customer.phone');
      }
      if (email !== undefined && email !== customerBefore.email) {
        params.push(email);
        sets.push(`email = $${params.length}`);
        changed.push('customer.email');
      }

      if (sets.length > 0) {
        await client.query(
          `UPDATE customers
              SET ${sets.join(', ')}, updated_at = NOW()
            WHERE organization_id = $1 AND id = $2`,
          params,
        );
      }
    }

    const customerAfterRes = visit.customer_id
      ? await client.query<CustomerRow>(CUSTOMER_SELECT, [orgId, visit.customer_id])
      : null;
    const after = snapshot(customerAfterRes?.rows[0] ?? null, await readDevices(client, orgId, visitId));

    return { ok: true as const, changed, before, after };
  });
}

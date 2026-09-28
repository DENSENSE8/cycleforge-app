/**
 * Per-org system-role seeding + owner admin wiring.
 *
 * `roles` is per-tenant (unique `(organization_id, key)`), so every new org
 * needs its own copy of the system roles, and a staff member is only ever
 * wired to roles of its OWN org. Runs on the owner pool inside the caller's
 * transaction (signup, QA provisioning), which bypasses RLS — hence every
 * statement here filters on `organization_id` explicitly.
 *
 * Non-admin permission sets mirror scripts/seed-roles.mjs; admin gets the full
 * live registry (same as the admin short-circuit at runtime).
 */

import type { Pool, PoolClient } from 'pg';
import dbPool from '@/lib/db';
import { ALL_PERMISSIONS, ADMIN_ROLE_KEY } from './permissions-shared';

type Executor = Pool | PoolClient;

interface SystemRoleSeed {
  key: string;
  label: string;
  color: string;
  position: number;
  permissions: readonly string[];
}

const SHARED_FLOOR = ['sku_stock.view', 'bin.adjust', 'bin.set', 'bin.add_sku', 'print.label'];
const WORK_ORDERS = ['work_orders.view', 'work_orders.claim', 'work_orders.complete'];

export const SYSTEM_ROLE_SEED: readonly SystemRoleSeed[] = [
  { key: ADMIN_ROLE_KEY, label: 'Admin', color: '#1f2937', position: 1, permissions: Array.from(ALL_PERMISSIONS) },
  {
    key: 'receiver', label: 'Receiver', color: '#0ea5e9', position: 10,
    permissions: [
      'receiving.view', 'receiving.scan_po', 'receiving.mark_received', 'receiving.upload_photo',
      'receiving.bin_assign', ...SHARED_FLOOR, 'walk_in.view', ...WORK_ORDERS,
    ],
  },
  {
    key: 'packer', label: 'Packer', color: '#1f2937', position: 20,
    permissions: [
      'packing.view', 'packing.start_session', 'packing.scan_order', 'packing.print_label',
      'packing.complete_order', 'shipping.mark_shipped', 'fba.stage_shipments', ...SHARED_FLOOR,
      ...WORK_ORDERS, 'dashboard.view',
    ],
  },
  {
    key: 'technician', label: 'Technician', color: '#10b981', position: 30,
    permissions: [
      'tech.view', 'tech.scan_serial', 'tech.qc_pass', 'tech.qc_fail', 'tech.assign_bin',
      'serial_units.grade', 'picking.view', 'picking.scan', 'picking.substitute_unit', 'orders.view',
      'repair.view', 'repair.intake', 'repair.mark_repaired', ...SHARED_FLOOR, ...WORK_ORDERS,
    ],
  },
  {
    key: 'shipper', label: 'Shipper', color: '#ef4444', position: 40,
    permissions: [
      'shipping.view', 'shipping.mark_shipped', 'shipping.void_order', 'orders.view',
      'dashboard.view', 'print.label', 'rma.view', 'rma.manage',
    ],
  },
  {
    key: 'inventory_manager', label: 'Inventory Manager', color: '#a855f7', position: 50,
    permissions: [
      'sku_stock.view', 'sku_stock.adjust', 'sku_stock.manage', 'bin.adjust', 'bin.set', 'bin.rename',
      'bin.swap', 'bin.remove', 'bin.add_sku', 'cycle_count.view', 'cycle_count.approve',
      'replenish.create_po', 'replenish.approve_po', 'fba.view', 'reports.view', 'operations.view',
      'stock_alerts.ack', 'admin.view_logs',
    ],
  },
  {
    key: 'sales', label: 'Sales', color: '#ec4899', position: 60,
    permissions: [
      'dashboard.view', 'orders.view', 'orders.create', 'orders.import', 'walk_in.view',
      'walk_in.intake', 'sku_stock.view', 'repair.view', 'reports.view', 'rma.view', 'rma.manage',
    ],
  },
  {
    key: 'viewer', label: 'Viewer', color: '#6b7280', position: 70,
    permissions: [
      'dashboard.view', 'operations.view', 'operations.tv.view', 'receiving.view', 'packing.view',
      'tech.view', 'picking.view', 'shipping.view', 'fba.view', 'sku_stock.view', 'cycle_count.view',
      'work_orders.view', 'walk_in.view', 'repair.view', 'orders.view', 'reports.view',
      'rma.view', 'rma.manage',
    ],
  },
  { key: 'kiosk', label: 'TV Kiosk', color: '#0f766e', position: 80, permissions: ['operations.tv.view'] },
];

/** Seed the system roles for `orgId` (idempotent; never touches edited roles). One round trip. */
export async function seedOrgRoles(orgId: string, db: Executor = dbPool): Promise<void> {
  await db.query(
    `INSERT INTO roles (organization_id, key, label, color, position, permissions, is_system)
     SELECT $1::uuid, s.key, s.label, s.color, s.position,
            ARRAY(SELECT jsonb_array_elements_text(s.permissions)), true
       FROM jsonb_to_recordset($2::jsonb)
         AS s(key text, label text, color text, position int, permissions jsonb)
     ON CONFLICT (organization_id, key) DO NOTHING`,
    [orgId, JSON.stringify(SYSTEM_ROLE_SEED)],
  );
}

/**
 * Seed `orgId`'s system roles and wire `staffId` to THAT org's admin role only.
 * Returns true if the assignment exists afterwards.
 */
export async function ensureAdminRoleWired(
  staffId: number,
  orgId: string,
  db: Executor = dbPool,
): Promise<boolean> {
  await seedOrgRoles(orgId, db);
  const r = await db.query(
    `WITH wired AS (
       INSERT INTO staff_roles (staff_id, role_id)
       SELECT $1, r.id FROM roles r
        WHERE r.organization_id = $2::uuid AND r.key = $3
       ON CONFLICT DO NOTHING
       RETURNING 1
     )
     SELECT 1 FROM wired
     UNION ALL
     SELECT 1 FROM staff_roles sr JOIN roles r ON r.id = sr.role_id
      WHERE sr.staff_id = $1 AND r.organization_id = $2::uuid AND r.key = $3
     LIMIT 1`,
    [staffId, orgId, ADMIN_ROLE_KEY],
  );
  return (r.rowCount ?? 0) > 0;
}

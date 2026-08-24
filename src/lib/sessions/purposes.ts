/**
 * work_session_purposes — the org catalog (L1).
 *
 * Titles are instances; purposes are the durable bucket a report groups by.
 * Creating "Staff assist" is an INSERT, not a migration. System rows are
 * seeded from ./purpose-catalog.ts and never overwritten on conflict.
 *
 * Collaborators are injected so tests share the work-sessions fake. This
 * module does not import ./work-sessions (that file calls US) so there is
 * no cycle — the queryable shape is restated here, three lines.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { SYSTEM_PURPOSE_KEYS, SYSTEM_PURPOSES } from './purpose-catalog';
import type { SessionKind, WorkSessionPurpose } from './types';

export interface PurposeQueryable {
  query: (
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface PurposeDeps {
  withTenantTransaction: <T>(
    orgId: OrgId,
    fn: (db: PurposeQueryable) => Promise<T>,
  ) => Promise<T>;
}

export const defaultPurposeDeps: PurposeDeps = {
  withTenantTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, (client) => fn(client));
  },
};

const PURPOSE_COLUMNS = `
  id, organization_id, key, label, default_surface_key, default_kind,
  is_system, sort_order, archived_at
`;

export function mapPurpose(row: Record<string, unknown>): WorkSessionPurpose {
  return {
    id: Number(row.id),
    organizationId: String(row.organization_id),
    key: String(row.key),
    label: String(row.label),
    defaultSurfaceKey: (row.default_surface_key as string | null) ?? null,
    defaultKind: row.default_kind as SessionKind,
    isSystem: row.is_system === true,
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
  };
}

/** Insert any missing system rows. Never overwrites a tenant-relabelled label. */
export async function ensureSystemPurposes(db: PurposeQueryable, orgId: OrgId): Promise<void> {
  for (const seed of SYSTEM_PURPOSES) {
    await db.query(
      `INSERT INTO work_session_purposes
         (organization_id, key, label, default_kind, default_surface_key, is_system, sort_order)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (organization_id, key) DO NOTHING`,
      [orgId, seed.key, seed.label, seed.defaultKind, seed.defaultSurfaceKey, seed.sortOrder],
    );
  }
}

export async function listPurposes(
  args: { orgId: OrgId; includeArchived?: boolean },
  deps: PurposeDeps = defaultPurposeDeps,
): Promise<WorkSessionPurpose[]> {
  return deps.withTenantTransaction(args.orgId, async (db) => {
    await ensureSystemPurposes(db, args.orgId);
    const archived = args.includeArchived === true;
    const { rows } = await db.query(
      `SELECT ${PURPOSE_COLUMNS} FROM work_session_purposes
        WHERE organization_id = $1
          ${archived ? '' : 'AND archived_at IS NULL'}
        ORDER BY sort_order, id`,
      [args.orgId],
    );
    return (rows as Array<Record<string, unknown>>).map(mapPurpose);
  });
}

export async function getPurpose(
  db: PurposeQueryable,
  orgId: OrgId,
  purposeId: number,
): Promise<WorkSessionPurpose | null> {
  const { rows } = await db.query(
    `SELECT ${PURPOSE_COLUMNS} FROM work_session_purposes
      WHERE organization_id = $1 AND id = $2`,
    [orgId, purposeId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapPurpose(row) : null;
}

/**
 * Dedupe by org + lower(label), including archived — "staff assist" must not
 * fork. A new custom row is kind=task, no surface, is_system=false.
 */
export async function findOrCreatePurpose(
  db: PurposeQueryable,
  orgId: OrgId,
  label: string,
): Promise<WorkSessionPurpose> {
  const trimmed = label.trim();
  if (!trimmed) {
    throw Object.assign(new Error('PURPOSE_LABEL_REQUIRED'), { code: 'PURPOSE_LABEL_REQUIRED' });
  }

  const existing = await db.query(
    `SELECT ${PURPOSE_COLUMNS} FROM work_session_purposes
      WHERE organization_id = $1 AND lower(label) = lower($2)
      ORDER BY archived_at NULLS FIRST, id
      LIMIT 1`,
    [orgId, trimmed],
  );
  const hit = existing.rows[0] as Record<string, unknown> | undefined;
  if (hit) return mapPurpose(hit);

  const key = uniqueCustomKey(trimmed, await keysInOrg(db, orgId));
  const inserted = await db.query(
    `INSERT INTO work_session_purposes
       (organization_id, key, label, default_kind, default_surface_key, is_system, sort_order)
     VALUES ($1, $2, $3, 'task', NULL, false, 1000)
     RETURNING ${PURPOSE_COLUMNS}`,
    [orgId, key, trimmed],
  );
  return mapPurpose(inserted.rows[0] as Record<string, unknown>);
}

async function keysInOrg(db: PurposeQueryable, orgId: OrgId): Promise<Set<string>> {
  const { rows } = await db.query(
    `SELECT key FROM work_session_purposes WHERE organization_id = $1`,
    [orgId],
  );
  return new Set((rows as Array<Record<string, unknown>>).map((r) => String(r.key)));
}

export function slugPurposeKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'custom';
}

function uniqueCustomKey(label: string, taken: Set<string>): string {
  let base = slugPurposeKey(label);
  if ((SYSTEM_PURPOSE_KEYS as readonly string[]).includes(base) || taken.has(base)) {
    base = `custom-${base}`;
  }
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

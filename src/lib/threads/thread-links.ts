/** Thread cross-entity links — curated "this thread also concerns entity X" connections (migration 2026-07-15_thread_crud_connections.sql). */

import { withTenantConnection, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { SURFACE_ENTITY_TYPES, isSurfaceEntityType } from '@/lib/surfaces/registry';
import type { ThreadsDeps } from './threads';
import {
  THREAD_LINK_ENTITY_TYPES,
  THREAD_LINK_ROLES,
  type ThreadLink,
  type ThreadLinkEntityType,
  type ThreadLinkRole,
} from './types';

const defaultDeps: ThreadsDeps = {
  runQuery: (orgId, fn) => withTenantConnection(orgId, (client) => fn(client)),
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client)),
};

/** Parent table for validation — the 7 anchors from the registry, plus SKU. */
function parentTableFor(entityType: ThreadLinkEntityType): string | null {
  if (entityType === 'SKU') return 'sku_catalog';
  if (isSurfaceEntityType(entityType)) return SURFACE_ENTITY_TYPES[entityType].parentTable;
  return null;
}

function mapLink(row: Record<string, unknown>): ThreadLink {
  const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    id: Number(row.id),
    threadId: Number(row.thread_id),
    entityType: String(row.entity_type) as ThreadLinkEntityType,
    entityId: Number(row.entity_id),
    linkRole: String(row.link_role) as ThreadLinkRole,
    createdBy: row.created_by == null ? null : Number(row.created_by),
    createdAt: toIso(row.created_at),
  };
}

// ─── listThreadLinks ─────────────────────────────────────────────────────────

export async function listThreadLinks(
  orgId: OrgId,
  threadId: number,
  deps: ThreadsDeps = defaultDeps,
): Promise<ThreadLink[]> {
  return deps.runQuery(orgId, async (client) => {
    const res = await client.query(
      `SELECT id, thread_id, entity_type, entity_id, link_role, created_by, created_at
         FROM thread_links
        WHERE thread_id = $1::bigint AND organization_id = $2::uuid
        ORDER BY created_at ASC, id ASC`,
      [threadId, orgId],
    );
    return res.rows.map(mapLink);
  });
}

// ─── linkThreadEntity ────────────────────────────────────────────────────────

interface LinkThreadEntityInput {
  orgId: OrgId;
  threadId: number;
  entityType: ThreadLinkEntityType;
  entityId: number;
  linkRole?: ThreadLinkRole;
  createdBy?: number | null;
}

type LinkThreadEntityResult =
  | { ok: true; link: ThreadLink; created: boolean }
  | { ok: false; status: 400 | 404; error: string };

export async function linkThreadEntity(
  input: LinkThreadEntityInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<LinkThreadEntityResult> {
  const linkRole = input.linkRole ?? 'related';
  if (!THREAD_LINK_ENTITY_TYPES.includes(input.entityType)) {
    return { ok: false, status: 400, error: `unknown entity_type "${input.entityType}"` };
  }
  if (!THREAD_LINK_ROLES.includes(linkRole)) {
    return { ok: false, status: 400, error: `unknown link_role "${linkRole}"` };
  }
  if (!Number.isSafeInteger(input.entityId) || input.entityId <= 0) {
    return { ok: false, status: 400, error: `invalid entityId ${input.entityId}` };
  }
  const parentTable = parentTableFor(input.entityType);
  if (!parentTable) {
    return { ok: false, status: 400, error: `no parent table for "${input.entityType}"` };
  }

  return deps.runTransaction(input.orgId, async (client) => {
    // Thread must exist + be live.
    const thread = await client.query(
      `SELECT 1 FROM entity_threads
        WHERE id = $1::bigint AND organization_id = $2::uuid AND deleted_at IS NULL`,
      [input.threadId, input.orgId],
    );
    if (thread.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `thread ${input.threadId} not found` };
    }
    // App-side parent-existence validation (org-scoped). parentTable is from the
    // registry / a fixed literal — never user input — so no injection surface.
    const parent = await client.query(
      `SELECT 1 FROM ${parentTable} WHERE id = $1 AND organization_id = $2::uuid`,
      [input.entityId, input.orgId],
    );
    if (parent.rows.length === 0) {
      return {
        ok: false as const,
        status: 404 as const,
        error: `${input.entityType} ${input.entityId} not found`,
      };
    }

    const res = await client.query(
      `INSERT INTO thread_links (organization_id, thread_id, entity_type, entity_id, link_role, created_by)
       VALUES ($1::uuid, $2::bigint, $3, $4::bigint, $5, $6::int)
       ON CONFLICT (organization_id, thread_id, entity_type, entity_id, link_role)
         DO UPDATE SET thread_id = thread_links.thread_id
       RETURNING id, thread_id, entity_type, entity_id, link_role, created_by, created_at,
                 (xmax = 0) AS inserted`,
      [input.orgId, input.threadId, input.entityType, input.entityId, linkRole, input.createdBy ?? null],
    );
    const row = res.rows[0];
    return { ok: true as const, link: mapLink(row), created: row.inserted === true };
  });
}

// ─── unlinkThreadEntity ──────────────────────────────────────────────────────

type UnlinkThreadEntityResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; status: 404; error: string };

export async function unlinkThreadEntity(
  orgId: OrgId,
  threadId: number,
  linkId: number,
  deps: ThreadsDeps = defaultDeps,
): Promise<UnlinkThreadEntityResult> {
  return deps.runTransaction(orgId, async (client) => {
    const res = await client.query(
      `DELETE FROM thread_links
        WHERE id = $1::bigint AND thread_id = $2::bigint AND organization_id = $3::uuid
        RETURNING id`,
      [linkId, threadId, orgId],
    );
    return res.rows.length === 0
      ? { ok: true as const, idempotent: true }
      : { ok: true as const, idempotent: false };
  });
}

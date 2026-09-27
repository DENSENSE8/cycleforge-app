/**
 * `/api/nav/recents` domain — read any recents surface as `NavRecentRow[]`,
 * and record an open on a `nav_recents`-backed surface. The staffer and org
 * always come from the auth context; a surface the caller lacks the
 * permission for is refused before any read.
 */

import type { NavRecentRow } from '@/lib/nav/context/schema';
import type { OrgId } from '@/lib/tenancy/constants';
import { getNavRecentSurface, type NavRecentSurfaceId } from '@/lib/nav/recents/surfaces';
import { isValidNavRecentEntityId, navRecentStoreHref } from '@/lib/nav/recents/hrefs';
import {
  defaultNavRecentsStoreDeps,
  listNavRecentRows,
  upsertNavRecent,
  type NavRecentDbRow,
  type NavRecentsStoreDeps,
} from '@/lib/nav/recents/store';
import {
  defaultNavRecentAdapterDeps,
  runNavRecentAdapter,
  type NavRecentAdapterDeps,
  type NavRecentAdapterId,
} from '@/lib/nav/recents/adapters';

export interface NavRecentsCaller {
  orgId: OrgId;
  staffId: number;
  permissions: ReadonlySet<string>;
}

export interface NavRecentsDeps {
  store: NavRecentsStoreDeps;
  adapters: NavRecentAdapterDeps;
}

export const defaultNavRecentsDeps: NavRecentsDeps = {
  store: defaultNavRecentsStoreDeps,
  adapters: defaultNavRecentAdapterDeps,
};

export type NavRecentsFailure =
  | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string }
  | { ok: false; status: 400; error: 'SURFACE_NOT_WRITABLE' | 'ENTITY_TYPE_NOT_ALLOWED' | 'INVALID_ENTITY_ID' };

/** Rows a surface returns when the caller names no limit. */
const DEFAULT_ADAPTER_LIMIT = 25;

/** Stored row → wire row. Title falls back to the entity when the snapshot is blank. */
export function navRecentStoreRow(surface: string, row: NavRecentDbRow): NavRecentRow {
  const opened = row.opened_at instanceof Date ? row.opened_at : new Date(row.opened_at);
  return {
    id: `${row.entity_type}:${row.entity_id}`,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.label_snapshot.trim() || `${row.entity_type} ${row.entity_id}`,
    subtitle: null,
    status: null,
    at: opened.toISOString(),
    href: navRecentStoreHref(surface, row.entity_type, row.entity_id),
  };
}

/** One surface read on the wire: newest-first rows, and the cursor of the next (older) page, if any. */
export interface NavRecentsList {
  ok: true;
  surface: NavRecentSurfaceId;
  rows: NavRecentRow[];
  nextBefore: string | null;
}

export async function listNavRecents(
  caller: NavRecentsCaller,
  input: { surface: NavRecentSurfaceId; limit?: number; before?: string; q?: string },
  deps: NavRecentsDeps = defaultNavRecentsDeps,
): Promise<NavRecentsList | NavRecentsFailure> {
  const surface = getNavRecentSurface(input.surface);
  if (!surface) throw new Error(`unknown recents surface: ${input.surface}`);
  if (surface.permission && !caller.permissions.has(surface.permission)) {
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: surface.permission };
  }

  if (surface.source === 'nav_recents') {
    const limit = Math.min(input.limit ?? surface.cap, surface.cap);
    const rows = await listNavRecentRows(
      { orgId: caller.orgId, staffId: caller.staffId, surface: surface.id, limit },
      deps.store,
    );
    return {
      ok: true,
      surface: input.surface,
      rows: rows.map((row) => navRecentStoreRow(surface.id, row)),
      nextBefore: null,
    };
  }

  const page = await runNavRecentAdapter(
    surface.id as NavRecentAdapterId,
    {
      orgId: caller.orgId,
      staffId: caller.staffId,
      limit: input.limit ?? DEFAULT_ADAPTER_LIMIT,
      // A surface reads only the knobs it declares.
      before: surface.paged ? input.before : undefined,
      q: surface.find && input.q ? input.q : undefined,
    },
    deps.adapters,
  );
  return { ok: true, surface: input.surface, rows: page.rows, nextBefore: page.nextBefore };
}

export async function recordNavRecentOpen(
  caller: NavRecentsCaller,
  input: { surface: NavRecentSurfaceId; entityType: string; entityId: string; label: string },
  deps: NavRecentsDeps = defaultNavRecentsDeps,
): Promise<{ ok: true } | NavRecentsFailure> {
  const surface = getNavRecentSurface(input.surface);
  if (!surface) throw new Error(`unknown recents surface: ${input.surface}`);
  if (surface.permission && !caller.permissions.has(surface.permission)) {
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: surface.permission };
  }
  // Adapter surfaces are written by their own feed (a scan, a view stamp, a print).
  if (surface.source !== 'nav_recents') return { ok: false, status: 400, error: 'SURFACE_NOT_WRITABLE' };
  if (!surface.entityTypes.includes(input.entityType)) {
    return { ok: false, status: 400, error: 'ENTITY_TYPE_NOT_ALLOWED' };
  }
  if (!isValidNavRecentEntityId(surface.id, input.entityType, input.entityId)) {
    return { ok: false, status: 400, error: 'INVALID_ENTITY_ID' };
  }

  await upsertNavRecent(
    {
      orgId: caller.orgId,
      staffId: caller.staffId,
      surface: surface.id,
      entityType: input.entityType,
      entityId: input.entityId,
      label: input.label,
      cap: surface.cap,
    },
    deps.store,
  );
  return { ok: true };
}

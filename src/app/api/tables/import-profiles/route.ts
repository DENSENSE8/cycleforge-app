import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { ImportMappingProfilePutBody } from '@/lib/schemas/import-profiles';
import {
  readStoredProfiles,
  removeProfile,
  upsertProfile,
} from '@/lib/tables/import/mapping-profiles';
import {
  getOrganization,
  invalidateOrgCache,
  mergeOrgSettingsRaw,
} from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET  /api/tables/import-profiles?surface=orders — this org's named column
 *   mappings for one import surface.
 * PUT  /api/tables/import-profiles — upsert one profile by name, or delete it
 *   with `profile: null` + `name`.
 *
 * Sibling of `/api/tables/layouts`, and stored the same way: in the
 * `organizations.settings` passthrough bag, so this ships **without a
 * migration**.
 *
 * ## Why the write gate is `orders.import` and not `admin.manage_features`
 *
 * A layout changes what every staffer in the org SEES, which is why its write
 * sits at feature-management altitude. A mapping profile changes nothing until
 * somebody runs an import, and the person who learns a supplier's file is the
 * person importing it — gating this behind an admin would mean the operator
 * doing the work cannot save the thing that makes it cheaper next week, which
 * is the whole feature.
 *
 * They are org-wide on purpose: the next person to receive that supplier's file
 * should not have to re-learn it. That is the same reasoning the layout law
 * uses, applied to a cheaper object.
 */

const SETTINGS_KEY = 'importMappingProfiles';

/** Known import surfaces. An unregistered id 404s rather than storing a blob. */
const IMPORT_SURFACES = new Set(['orders']);

function readSurfaceProfiles(settings: Record<string, unknown>, surface: string) {
  const bag = settings[SETTINGS_KEY];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return [];
  return readStoredProfiles((bag as Record<string, unknown>)[surface]);
}

/** Whole-map read-modify-write, the shape `nextTableLayoutsMap` uses. */
function nextProfilesMap(
  settings: Record<string, unknown>,
  surface: string,
  profiles: ReturnType<typeof readStoredProfiles>,
): Record<string, unknown> {
  const bag = settings[SETTINGS_KEY];
  const current =
    bag && typeof bag === 'object' && !Array.isArray(bag)
      ? { ...(bag as Record<string, unknown>) }
      : {};
  if (profiles.length === 0) delete current[surface];
  else current[surface] = profiles;
  return current;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const surface = new URL(req.url).searchParams.get('surface') ?? '';
      if (!IMPORT_SURFACES.has(surface)) {
        return NextResponse.json(
          { success: false, error: 'UNKNOWN_SURFACE', surface },
          { status: 404 },
        );
      }
      const org = await getOrganization(ctx.organizationId as OrgId);
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      return NextResponse.json({
        success: true,
        surface,
        profiles: readSurfaceProfiles(settings, surface),
      });
    } catch (error) {
      console.error('[GET /api/tables/import-profiles] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load mapping profiles' },
        { status: 500 },
      );
    }
  },
  { permission: 'orders.import' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = parseBody(ImportMappingProfilePutBody, raw);
      if (parsed instanceof NextResponse) return parsed;
      const { surface, name, profile } = parsed;

      if (!IMPORT_SURFACES.has(surface)) {
        return NextResponse.json(
          { success: false, error: 'UNKNOWN_SURFACE', surface },
          { status: 404 },
        );
      }

      // Fresh read for the read-modify-write: the org row is cached 30s
      // per-instance, and seeding the merge from a stale copy would resurrect a
      // profile somebody else just deleted.
      invalidateOrgCache(ctx.organizationId as OrgId);
      const org = await getOrganization(ctx.organizationId as OrgId);
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      const before = readSurfaceProfiles(settings, surface);

      const after = profile
        ? upsertProfile(before, {
            name: profile.name,
            headers: profile.headers,
            mapping: profile.mapping,
            updatedAt: new Date().toISOString(),
          })
        : removeProfile(before, name);

      await mergeOrgSettingsRaw(ctx.organizationId as OrgId, {
        [SETTINGS_KEY]: nextProfilesMap(settings, surface, after),
      });

      await recordAudit(pool, ctx, req, {
        source: 'import-profiles-api',
        action: AUDIT_ACTION.SETTINGS_UPDATE,
        entityType: AUDIT_ENTITY.SETTINGS,
        entityId: `${SETTINGS_KEY}.${surface}`,
        before: { count: before.length },
        after: { count: after.length, name },
      });

      return NextResponse.json({ success: true, surface, profiles: after });
    } catch (error) {
      console.error('[PUT /api/tables/import-profiles] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save the mapping profile' },
        { status: 500 },
      );
    }
  },
  { permission: 'orders.import' },
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { readStoredExportFieldIds } from '@/lib/tables/export/export-fields';
import {
  getOrganization,
  invalidateOrgCache,
  mergeOrgSettingsRaw,
} from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/tables/export-fields?tableId=orders — this org's chosen export
 *   columns for one table, or null when it runs the family defaults.
 * PUT /api/tables/export-fields — replace that choice.
 *
 * Third and last resident of the `organizations.settings` passthrough bag,
 * beside `tableLayouts` and `importMappingProfiles` — so, again, no migration.
 *
 * ## Why the gate is `dashboard.view` on read and `dashboard.view` on write
 *
 * Unlike a LAYOUT, this changes nothing anyone sees: it changes what a file
 * contains, and only for the person who then downloads one. Gating it at
 * feature-management altitude would mean the operator preparing a restock order
 * cannot choose the two columns they need — which is the whole feature. It is
 * org-wide for consistency of the artifact, not because it is privileged.
 *
 * The stored value is deliberately NOT validated against a field registry: the
 * registry lives on the client (a family's catalog ∪ its export-only facts) and
 * `resolveExportFieldIds` already drops ids it does not recognise on read. A
 * server-side allowlist would be a second copy of the registry that could only
 * ever disagree with the first.
 */

const SETTINGS_KEY = 'exportFields';

const ExportFieldsPutBody = z
  .object({
    tableId: z.string().min(1).max(64),
    /** Empty array clears the choice — the family defaults come back. */
    fieldIds: z.array(z.string().min(1).max(128)).max(256),
  })
  .strict();

function readBag(settings: Record<string, unknown>): Record<string, unknown> {
  const bag = settings[SETTINGS_KEY];
  return bag && typeof bag === 'object' && !Array.isArray(bag)
    ? { ...(bag as Record<string, unknown>) }
    : {};
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const tableId = new URL(req.url).searchParams.get('tableId') ?? '';
      if (!tableId) {
        return NextResponse.json({ success: false, error: 'MISSING_TABLE' }, { status: 400 });
      }
      const org = await getOrganization(ctx.organizationId as OrgId);
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      return NextResponse.json({
        success: true,
        tableId,
        fieldIds: readStoredExportFieldIds(readBag(settings)[tableId]),
      });
    } catch (error) {
      console.error('[GET /api/tables/export-fields] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load the export columns' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = parseBody(ExportFieldsPutBody, raw);
      if (parsed instanceof NextResponse) return parsed;
      const { tableId, fieldIds } = parsed;

      // Fresh read for the read-modify-write — the org row is cached 30s
      // per-instance and a stale seed would resurrect a choice someone replaced.
      invalidateOrgCache(ctx.organizationId as OrgId);
      const org = await getOrganization(ctx.organizationId as OrgId);
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      const bag = readBag(settings);
      const before = readStoredExportFieldIds(bag[tableId]);

      if (fieldIds.length === 0) delete bag[tableId];
      else bag[tableId] = fieldIds;

      await mergeOrgSettingsRaw(ctx.organizationId as OrgId, { [SETTINGS_KEY]: bag });

      await recordAudit(pool, ctx, req, {
        source: 'export-fields-api',
        action: AUDIT_ACTION.SETTINGS_UPDATE,
        entityType: AUDIT_ENTITY.SETTINGS,
        entityId: `${SETTINGS_KEY}.${tableId}`,
        before: { fieldIds: before },
        after: { fieldIds: fieldIds.length === 0 ? null : fieldIds },
      });

      return NextResponse.json({ success: true, tableId, fieldIds });
    } catch (error) {
      console.error('[PUT /api/tables/export-fields] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save the export columns' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);

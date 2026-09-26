/** /api/staff-preferences — the logged-in staffer's own UI preferences. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { StaffPreferencesPutBody } from '@/lib/schemas/staff-preferences';
import {
  getStaffPreferences,
  updateStaffPreferences,
} from '@/lib/neon/staff-preferences-queries';
import { getOrganization } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OrgSettings } from '@/lib/tenancy/settings';
import { resolveUnboxPinnedTabs } from '@/lib/receiving/unbox-default-pins';
import {
  getReceivingUnboxDefaultPins,
  getReceivingUnboxRoleDefaultPins,
} from '@/lib/settings/accessors';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

const AUDIT_SOURCE = 'staff-preferences-api';

export const GET = withAuth(async (_req, ctx) => {
  const [prefs, org] = await Promise.all([
    getStaffPreferences(ctx.staffId, ctx.organizationId),
    getOrganization(ctx.organizationId as OrgId),
  ]);
  // Effective NON-STAFF default for the Unbox Band-1 Inbound pin:
  const orgSettings = (org?.settings ?? {}) as OrgSettings;
  const unboxDefaultPins = resolveUnboxPinnedTabs({
    roleDefault: getReceivingUnboxRoleDefaultPins(orgSettings, ctx.role),
    orgDefault: getReceivingUnboxDefaultPins(orgSettings),
  });
  return NextResponse.json({ prefs, unboxDefaultPins });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(StaffPreferencesPutBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const before = await getStaffPreferences(ctx.staffId, ctx.organizationId);
  const prefs = await updateStaffPreferences(ctx.staffId, ctx.organizationId, parsed);

  await recordAudit(pool, ctx, req, {
    source: AUDIT_SOURCE,
    action: AUDIT_ACTION.STAFF_PREFERENCE_UPDATE,
    entityType: AUDIT_ENTITY.STAFF_PREFERENCE,
    entityId: ctx.staffId,
    before: before as Record<string, unknown>,
    after: prefs as Record<string, unknown>,
  });

  return NextResponse.json({ prefs });
});

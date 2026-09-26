import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { findUnitUidsBySerials, normalizeSerial } from '@/lib/neon/serial-units-queries';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** POST /api/serial-units/resolve-batch */
export const POST = withAuth(
  async (request, ctx) => {
    const orgId = ctx.organizationId as OrgId;
    const body = await request.json().catch(() => ({}));
    const rawSerials: unknown = body?.serials;
    if (!Array.isArray(rawSerials)) {
      return NextResponse.json(
        { ok: false, error: 'serials must be an array' },
        { status: 400 },
      );
    }

    // Trim + cap; keep the caller's casing for the echo. Bound the ANY() list so
    // an oversized selection can't blow up the query plan.
    const serials = rawSerials
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .slice(0, 500);
    if (serials.length === 0) {
      return NextResponse.json({ ok: true, units: [] });
    }

    const rows = await findUnitUidsBySerials(serials, orgId);
    const byNormalized = new Map(rows.map((r) => [r.normalized_serial, r]));
    const units = serials.map((serial) => {
      const row = byNormalized.get(normalizeSerial(serial));
      return {
        serial,
        unit_uid: row?.unit_uid ?? null,
        serial_unit_id: row?.id ?? null,
      };
    });
    return NextResponse.json({ ok: true, units });
  },
  { permission: 'print.label' },
);

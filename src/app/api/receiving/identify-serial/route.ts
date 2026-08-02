/**
 * POST /api/receiving/identify-serial
 *
 * Resolve serial string(s) the LAN vision box read off a unit against this
 * carton, so the Unbox bench can pre-fill the serial field and warn about a
 * duplicate before the operator commits.
 *
 * TEXT ONLY — the browser posts the captured frame straight to the box
 * (`NEXT_PUBLIC_VISION_BASE_URL`, full-res never reaches Vercel) and forwards
 * the resulting string(s) here. Exactly the contract `/identify-label` has; no
 * image ever reaches this route.
 *
 * READ-ONLY. Attaching a serial stays `POST /api/receiving/scan-serial`. OCR
 * proposes; the operator commits — a vision system that wrote directly would
 * attribute a scan to a person who never made one.
 *
 * `receiving.view`, not `receiving.edit`: it reads, and gating a read behind an
 * edit permission is how `/api/support/tickets/link` ended up 403-ing the floor
 * operator its surface was built for.
 *
 * Body: `{ receivingLineId: number, reads: string[] }` (or `read: string`)
 * Resp: `{ success, candidates: SerialCandidate[] }`
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveSerialReads, type SerialIdentifyDeps } from '@/lib/receiving/serial-identify';

const deps: SerialIdentifyDeps = {
  findExisting: async (orgId, normalized) => {
    // `upper(trim($n))` mirrors the definition of `serial_units.normalized_serial`
    // (`@/lib/receiving/serial-attach`), so "the same serial" means the same
    // thing on both sides of this comparison.
    //
    // Line membership goes through `serial_unit_provenance`, the same reverse
    // lookup the attach path uses — `serial_units` has no `receiving_line_id`.
    const res = await tenantQuery<{ normalized_serial: string; receiving_line_id: number | null }>(
      orgId as OrgId,
      `SELECT su.normalized_serial,
              (SELECT p.origin_id
                 FROM serial_unit_provenance p
                WHERE p.serial_unit_id = su.id
                  AND p.organization_id = su.organization_id
                  AND p.origin_type = 'RECEIVING_LINE'
                ORDER BY p.id DESC
                LIMIT 1) AS receiving_line_id
         FROM serial_units su
        WHERE su.organization_id = $1
          AND su.normalized_serial = ANY(
                SELECT upper(trim(x)) FROM unnest($2::text[]) AS x
              )`,
      [orgId, normalized],
    );
    return res.rows.map((row) => ({
      normalized: row.normalized_serial,
      receivingLineId: row.receiving_line_id,
    }));
  },
};

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
    }

    const receivingLineId = Number(body.receivingLineId);
    if (!Number.isFinite(receivingLineId) || receivingLineId <= 0) {
      return NextResponse.json(
        { success: false, error: 'receivingLineId is required' },
        { status: 400 },
      );
    }

    const reads: string[] = Array.isArray(body.reads)
      ? (body.reads as unknown[]).map((r) => String(r ?? '')).filter(Boolean)
      : typeof body.read === 'string' && body.read.trim()
        ? [body.read.trim()]
        : [];

    if (reads.length === 0) {
      return NextResponse.json(
        { success: false, error: 'read (string) or reads (string[]) is required' },
        { status: 400 },
      );
    }

    const candidates = await resolveSerialReads(
      { orgId: ctx.organizationId, receivingLineId, reads },
      deps,
    );
    return NextResponse.json({ success: true, candidates });
  },
  { permission: 'receiving.view' },
);

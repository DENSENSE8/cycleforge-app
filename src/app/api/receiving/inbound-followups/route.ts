/** /api/receiving/inbound-followups — staff tags on pasted inbound numbers (Incoming ledger + nav popout). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { InboundFollowupsQuery, InboundFollowupsWrite } from '@/lib/schemas/inbound-followups';
import { readInboundFollowups, writeInboundFollowups } from '@/lib/receiving/inbound-followups-store';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

/** GET ?keys=A,B — the follow-ups set on those canonical keys. */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = new URL(req.url).searchParams.get('keys') ?? '';
    const parsed = parseBody(InboundFollowupsQuery, {
      keys: raw.split(',').map((k) => k.trim()).filter(Boolean),
    });
    if (parsed instanceof NextResponse) return parsed;

    const followups = await readInboundFollowups(ctx.organizationId, parsed.keys);
    return NextResponse.json({ followups });
  },
  { permission: 'receiving.view' },
);

/**
 * POST { keys, tag, note? } — tag every key (tag null = clear). Gated like the
 * carton staff-notes write (`PATCH /api/receiving/[id]` support_notes).
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(InboundFollowupsWrite, raw);
    if (parsed instanceof NextResponse) return parsed;

    const followups = await writeInboundFollowups(ctx.organizationId, ctx.staffId, parsed);

    await recordAudit(pool, ctx, req, {
      source: 'receiving-inbound-followups-api',
      action: parsed.tag === null ? AUDIT_ACTION.INBOUND_FOLLOWUP_CLEAR : AUDIT_ACTION.INBOUND_FOLLOWUP_SET,
      entityType: AUDIT_ENTITY.INBOUND_FOLLOWUP,
      entityId: parsed.keys.join(','),
      method: 'manual',
      after: { keys: parsed.keys, tag: parsed.tag, note: parsed.note ?? null },
    });
    return NextResponse.json({ followups });
  },
  { permission: 'receiving.mark_received' },
);

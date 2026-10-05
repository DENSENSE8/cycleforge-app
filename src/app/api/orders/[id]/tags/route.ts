import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import pool from '@/lib/db';
import { listOrderTags, writeOrderTag } from '@/lib/live-feed/tag-store';
import { normalizePackageTag, PACKAGE_TAG_MAX } from '@/lib/live-feed/tags';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';

/** A package's tags (`order_tags`) — GET the set; POST `{ tag, op: 'add' | 'remove' }` returns the new set. */

const TagBody = z.object({
  tag: z.string().trim().min(1).max(PACKAGE_TAG_MAX),
  op: z.enum(['add', 'remove']),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

  const tags = await listOrderTags(id, gate.ctx.organizationId);
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

  const parsed = parseBody(TagBody, await req.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;
  const tag = normalizePackageTag(parsed.tag);
  if (!tag) return NextResponse.json({ error: `A tag is 1–${PACKAGE_TAG_MAX} characters` }, { status: 400 });

  const result = await writeOrderTag({
    orderId: id,
    organizationId: gate.ctx.organizationId,
    tag,
    staffId: gate.ctx.staffId ?? null,
    op: parsed.op,
  });
  if (!result.ok) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  await publishOrderChanged({ organizationId: gate.ctx.organizationId, orderIds: [id], source: 'orders.tag' });
  await recordAudit(pool, gate.ctx, req, {
    source: 'live-feed-tag',
    action: AUDIT_ACTION.ORDER_UPDATE,
    entityType: AUDIT_ENTITY.ORDER,
    entityId: id,
    after: { tag, op: parsed.op, tags: result.tags },
  });

  return NextResponse.json({ tags: result.tags });
}

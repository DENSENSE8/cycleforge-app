/** `POST /api/support/items` — open a local Support item: item + first message + thread + task + assignees + links in ONE transaction. */

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SupportItemCreateSchema } from '@/lib/schemas/support-items';
import { ingestSupportMessage, supportIngestDeps } from '@/lib/support/conversation/ingest';
import { supportTransportForPlatform } from '@/lib/support/conversation/platform-transport';
import { supportHref } from '@/lib/nav/route-tree';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

interface PickedPlatform {
  platformId: number;
  slug: string;
  accountId: number | null;
  accountLabel: string | null;
}

/** The org's platform (and, when named, one of ITS accounts) — null when either is not this org's. */
async function readPickedPlatform(orgId: OrgId, platformId: number, accountId: number | null): Promise<PickedPlatform | null> {
  const res = await tenantQuery<{ id: string; slug: string; account_id: string | null; account_label: string | null }>(
    orgId,
    `SELECT p.id, p.slug, a.id AS account_id, a.label AS account_label
       FROM platforms p
       LEFT JOIN platform_accounts a
              ON a.organization_id = p.organization_id AND a.platform_id = p.id AND a.id = $3
      WHERE p.organization_id = $1::uuid AND p.id = $2`,
    [orgId, platformId, accountId],
  );
  const row = res.rows[0];
  if (!row || (accountId != null && row.account_id == null)) return null;
  return {
    platformId: Number(row.id),
    slug: row.slug,
    accountId: row.account_id == null ? null : Number(row.account_id),
    accountLabel: row.account_label,
  };
}

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const parsed = parseBody(SupportItemCreateSchema, await req.json().catch(() => ({})));
      if (parsed instanceof NextResponse) return parsed;
      const b = parsed;

      // The platform is first class; the transport (`provider`) is derived from it, never picked.
      const platform =
        b.platformId != null ? await readPickedPlatform(ctx.organizationId, b.platformId, b.platformAccountId ?? null) : null;
      if (b.platformId != null && !platform) {
        return NextResponse.json({ error: 'That platform or account is not in this organization' }, { status: 422 });
      }
      const channel = supportTransportForPlatform(b.purpose, platform?.slug ?? null);

      // Org + author from the auth context; the creator acknowledges the purpose.
      const result = await ingestSupportMessage(
        {
          orgId: ctx.organizationId,
          source: b.purpose === 'internal_record' ? 'internal_record' : 'staff',
          channel,
          direction: b.purpose === 'customer_conversation' ? 'inbound' : 'internal',
          body: b.body,
          authorStaffId: ctx.staffId,
          authorLabel: b.purpose === 'customer_conversation' ? (b.requester?.name ?? b.requester?.email ?? null) : null,
          requester: b.requester ?? null,
          subject: b.subject ?? null,
          platformId: platform?.platformId ?? null,
          platformAccountId: platform?.accountId ?? null,
          accountLabel: platform?.accountLabel ?? null,
          purpose: { value: b.purpose, source: 'staff', acknowledgedByStaffId: ctx.staffId },
          orderLinks: b.orderLinks,
          assigneeStaffIds: b.assigneeStaffIds,
          task: { urgency: b.urgency, deadlineAt: b.deadlineAt ?? null },
          clientEventId: b.clientEventId,
          mode: 'live',
        },
        { ...supportIngestDeps, runAfterCommit: (work) => after(work) },
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

      const href = supportHref({ item: result.supportItemId });
      if (!result.idempotent) {
        await recordAudit(pool, ctx, req, {
          source: 'support-api',
          action: AUDIT_ACTION.SUPPORT_ITEM_CREATE,
          entityType: AUDIT_ENTITY.SUPPORT_TICKET,
          entityId: result.supportItemId,
          after: {
            purpose: b.purpose,
            channel,
            platformId: platform?.platformId ?? null,
            platformAccountId: platform?.accountId ?? null,
            taskId: result.taskId,
            messageId: result.messageId,
            createdItem: result.createdItem,
            assigneeStaffIds: b.assigneeStaffIds,
            orderIds: (b.orderLinks ?? []).map((l) => l.orderId),
          },
        });
      }
      return NextResponse.json(
        { itemId: result.supportItemId, taskId: result.taskId, href, idempotent: result.idempotent },
        { status: result.createdItem ? 201 : 200 },
      );
    } catch (error) {
      return errorResponse(error, 'POST /api/support/items');
    }
  },
  { permission: 'support.thread.manage' },
);

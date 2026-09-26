/** `/api/tasks/[id]/links` — the records a task names beyond its anchor. */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { TaskLinkRefusal } from '@/lib/tasks/task-links';
import { createTaskLink, deleteTaskLink, listTaskLinks } from '@/lib/tasks/task-links-db';
import type { TaskLinksPayload } from '@/lib/tasks/task-links-shared';

export const dynamic = 'force-dynamic';

const CreateBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order'), entityId: z.number().int().positive() }),
  /** `#48120` or `48120` — parsed by `resolveTicketTarget`, never here. */
  z.object({ kind: z.literal('ticket'), value: z.string().trim().min(1).max(32) }),
  z.object({ kind: z.literal('tracking'), value: z.string().trim().min(1).max(200) }),
]);

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<TaskLinkRefusal, number> = {
  task_not_found: 404,
  order_not_found: 404,
  not_found: 404,
  invalid_tracking: 400,
  invalid_number: 400,
  helpdesk_unavailable: 503,
  anchor_duplicate: 409,
};

/** `/api/tasks/:id/links` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const links = await listTaskLinks(ctx.organizationId, taskId);
      if (!links) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }
      const payload: TaskLinksPayload = { ok: true, links };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/links');
    }
  },
  { permission: 'work_orders.claim' },
);

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const parsed = CreateBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      // Tenant and actor from the auth context, never the body.
      const result = await createTaskLink(ctx.organizationId, ctx.staffId, taskId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      if (result.registeredTicket) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.SUPPORT_TICKET_REGISTER,
          entityType: AUDIT_ENTITY.SUPPORT_TICKET,
          entityId: result.registeredTicket.supportTicketId,
          after: { providerTicketId: result.registeredTicket.providerTicketId, reason: 'task_link' },
        });
      }
      if (result.created) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_LINK_ADD,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          after: { linkId: result.link.id, entityId: result.link.entityId },
          extra: { kind: result.link.kind, label: result.link.label },
        });
      }

      return NextResponse.json({ ok: true, link: result.link }, { status: result.created ? 201 : 200 });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/links');
    }
  },
  { permission: 'work_orders.claim' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const linkId = Number(req.nextUrl.searchParams.get('linkId'));
      if (taskId === null || !Number.isInteger(linkId) || linkId <= 0) {
        return NextResponse.json(
          { error: 'task id and linkId must be positive integers' },
          { status: 400 },
        );
      }

      const result = await deleteTaskLink(ctx.organizationId, taskId, linkId);
      if (!result) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }

      if (result.changed) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_LINK_REMOVE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: { linkId },
          extra: { kind: result.face?.kind ?? null, label: result.face?.label ?? null },
        });
      }

      return NextResponse.json({ ok: true, changed: result.changed });
    } catch (error) {
      return errorResponse(error, 'DELETE /api/tasks/[id]/links');
    }
  },
  { permission: 'work_orders.claim' },
);

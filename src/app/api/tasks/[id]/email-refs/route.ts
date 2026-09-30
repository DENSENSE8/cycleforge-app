/** `/api/tasks/[id]/email-refs` — which customer email (on which inbound mailbox, with which order / reference number) a task came from. References only; never the email body. */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  createTaskEmailRef,
  deleteTaskEmailRef,
  listTaskEmailRefs,
  updateTaskEmailRef,
} from '@/lib/tasks/task-email-refs-db';
import {
  TASK_EMAIL_ADDRESS_MAX,
  TASK_EMAIL_NUMBER_MAX,
  TASK_EMAIL_SUBJECT_MAX,
  type TaskEmailRef,
  type TaskEmailRefRefusal,
} from '@/lib/tasks/task-email-refs-shared';

export const dynamic = 'force-dynamic';

/** Address / mailbox shape is the normaliser's call (`invalid_customer_email` / `invalid_mailbox`), not a schema 400. */
const Optional = (max: number) => z.string().max(max).nullable().optional();
const CreateBody = z.object({
  customerEmail: z.string().max(TASK_EMAIL_ADDRESS_MAX),
  mailbox: z.string().max(TASK_EMAIL_ADDRESS_MAX),
  orderNumber: Optional(TASK_EMAIL_NUMBER_MAX),
  referenceNumber: Optional(TASK_EMAIL_NUMBER_MAX),
  subject: Optional(TASK_EMAIL_SUBJECT_MAX),
});
const PatchBody = CreateBody.partial().refine((body) => Object.values(body).some((value) => value !== undefined), {
  message: 'Send at least one field',
});

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<TaskEmailRefRefusal, number> = {
  task_not_found: 404,
  ref_not_found: 404,
  invalid_customer_email: 400,
  invalid_mailbox: 400,
  both_numbers: 400,
  // The table's migration is not applied yet — a known, temporary state, not a fault.
  not_set_up: 503,
};

/** `/api/tasks/:id/email-refs` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function refIdFromQuery(req: NextRequest): number | null {
  const n = Number(req.nextUrl.searchParams.get('refId'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The audit keeps the reference's facts (all of them are operator-typed references, none is message content). */
function auditFace(ref: TaskEmailRef) {
  return {
    emailRefId: ref.id,
    customerEmail: ref.customerEmail,
    mailbox: ref.mailbox,
    orderNumber: ref.orderNumber,
    referenceNumber: ref.referenceNumber,
    subject: ref.subject,
  };
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const payload = await listTaskEmailRefs(ctx.organizationId, taskId);
      if (!payload) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/email-refs');
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
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
      }

      // Tenant and actor from the auth context, never the body.
      const result = await createTaskEmailRef(ctx.organizationId, ctx.staffId, taskId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      await recordAudit(pool, ctx, req, {
        source: 'api',
        action: AUDIT_ACTION.WORK_TASK_EMAIL_REF_ADD,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: taskId,
        after: auditFace(result.ref),
      });

      return NextResponse.json({ ok: true, ref: result.ref }, { status: 201 });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/email-refs');
    }
  },
  { permission: 'work_orders.claim' },
);

export const PATCH = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const refId = refIdFromQuery(req);
      if (taskId === null || refId === null) {
        return NextResponse.json({ error: 'task id and refId must be positive integers' }, { status: 400 });
      }
      const parsed = PatchBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
      }

      const result = await updateTaskEmailRef(ctx.organizationId, taskId, refId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      if (result.changed && result.before) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_EMAIL_REF_UPDATE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: auditFace(result.before),
          after: auditFace(result.ref),
        });
      }

      return NextResponse.json({ ok: true, ref: result.ref });
    } catch (error) {
      return errorResponse(error, 'PATCH /api/tasks/[id]/email-refs');
    }
  },
  { permission: 'work_orders.claim' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const refId = refIdFromQuery(req);
      if (taskId === null || refId === null) {
        return NextResponse.json({ error: 'task id and refId must be positive integers' }, { status: 400 });
      }

      const result = await deleteTaskEmailRef(ctx.organizationId, taskId, refId);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      if (result.removed) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_EMAIL_REF_REMOVE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: auditFace(result.removed),
        });
      }

      return NextResponse.json({ ok: true, changed: result.removed !== null });
    } catch (error) {
      return errorResponse(error, 'DELETE /api/tasks/[id]/email-refs');
    }
  },
  { permission: 'work_orders.claim' },
);

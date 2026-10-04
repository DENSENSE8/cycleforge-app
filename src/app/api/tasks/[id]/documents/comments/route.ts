/** `/api/tasks/[id]/documents/comments` — anchored comments on one task document (`?docId=`). */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  deleteTaskDocComment,
  listTaskDocComments,
  postTaskDocComment,
  resolveTaskDocComment,
  type TaskDocCommentRefusal,
} from '@/lib/tasks/task-document-comments-db';
import {
  TASK_DOC_COMMENT_BODY_MAX,
  TASK_DOC_COMMENT_QUOTE_MAX,
  type TaskDocCommentsPayload,
} from '@/lib/tasks/task-document-comments-shared';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  docId: z.number().int().positive(),
  body: z.string().trim().min(1).max(TASK_DOC_COMMENT_BODY_MAX),
  quote: z.string().max(TASK_DOC_COMMENT_QUOTE_MAX * 4).nullish(),
  headingSlug: z.string().max(200).nullish(),
  clientEventId: z.string().max(100).nullish(),
});

const ResolveBody = z.object({
  docId: z.number().int().positive(),
  commentId: z.number().int().positive(),
  resolved: z.boolean(),
});

const REFUSAL_STATUS: Record<TaskDocCommentRefusal, number> = {
  document_not_found: 404,
  comment_not_found: 404,
  not_author: 403,
};

/** `/api/tasks/:id/documents/comments` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function positiveParam(req: NextRequest, name: string): number | null {
  const n = Number(req.nextUrl.searchParams.get(name));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const docId = positiveParam(req, 'docId');
      if (taskId === null || docId === null) {
        return NextResponse.json({ error: 'task id and docId must be positive integers' }, { status: 400 });
      }
      const result = await listTaskDocComments(ctx.organizationId, taskId, docId);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      const payload: TaskDocCommentsPayload = { ok: true, comments: result.comments };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/documents/comments');
    }
  },
  { permission: 'work_orders.claim' },
);

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      const parsed = CreateBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
      }

      // Author and tenant from the auth context, never the body.
      const result = await postTaskDocComment(ctx.organizationId, ctx.staffId, taskId, parsed.data);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });

      if (result.created) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_DOC_COMMENT_ADD,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          after: { documentId: parsed.data.docId, commentId: result.comment.id },
          extra: { quote: result.comment.quote, headingSlug: result.comment.headingSlug },
        });
      }
      return NextResponse.json({ ok: true, comment: result.comment }, { status: result.created ? 201 : 200 });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/documents/comments');
    }
  },
  { permission: 'work_orders.claim' },
);

export const PATCH = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      const parsed = ResolveBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
      }
      const { docId, commentId, resolved } = parsed.data;
      const result = await resolveTaskDocComment(ctx.organizationId, ctx.staffId, taskId, docId, commentId, resolved);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });

      await recordAudit(pool, ctx, req, {
        source: 'api',
        action: AUDIT_ACTION.WORK_TASK_DOC_COMMENT_RESOLVE,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: taskId,
        after: { documentId: docId, commentId, resolved },
      });
      return NextResponse.json({ ok: true, comment: result.comment });
    } catch (error) {
      return errorResponse(error, 'PATCH /api/tasks/[id]/documents/comments');
    }
  },
  { permission: 'work_orders.claim' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const docId = positiveParam(req, 'docId');
      const commentId = positiveParam(req, 'commentId');
      if (taskId === null || docId === null || commentId === null) {
        return NextResponse.json({ error: 'task id, docId and commentId must be positive integers' }, { status: 400 });
      }
      const result = await deleteTaskDocComment(ctx.organizationId, ctx.staffId, taskId, docId, commentId);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });

      if (result.changed) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_DOC_COMMENT_REMOVE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: { documentId: docId, commentId },
        });
      }
      return NextResponse.json({ ok: true, changed: result.changed });
    } catch (error) {
      return errorResponse(error, 'DELETE /api/tasks/[id]/documents/comments');
    }
  },
  { permission: 'work_orders.claim' },
);

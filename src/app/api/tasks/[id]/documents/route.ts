/**
 * `/api/tasks/[id]/documents` — markdown documents attached to a task.
 *
 * GET               → `TaskDocumentsPayload`, oldest first, meta only (a
 *                     `repo` document's size is read from disk now; null
 *                     when the file is gone).
 * GET ?docId=N      → `TaskDocumentPayload`: an `upload`'s stored text, or a
 *                     `repo` plan file read NOW (`content: null` when gone).
 * POST              → attach an uploaded/written document or link a plan
 *                     file. 201 with the new document; 200 with the EXISTING
 *                     one when that plan file is already linked — a retried
 *                     tap is a no-op.
 * DELETE ?docId=N   → `{ ok, changed }`; `changed: false` when already gone.
 *
 * Refusals answer `{ error: <TASK_DOCUMENT_REFUSAL_COPY key> }`. Plan paths
 * are gated by `src/lib/tasks/plan-files.ts` (allowlist + realpath re-check).
 *
 * PERMISSION — `work_orders.claim`, the gate every task verb uses.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { TaskDocumentRefusal } from '@/lib/tasks/task-documents';
import {
  createTaskDocument,
  deleteTaskDocument,
  getTaskDocument,
  listTaskDocuments,
} from '@/lib/tasks/task-documents-db';
import {
  TASK_DOCUMENT_TITLE_MAX,
  type TaskDocumentPayload,
  type TaskDocumentsPayload,
} from '@/lib/tasks/task-documents-shared';

export const dynamic = 'force-dynamic';

const CreateBody = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('upload'),
    title: z.string().trim().min(1).max(TASK_DOCUMENT_TITLE_MAX),
    /** Length is the domain's call (`content_too_long` 413), not a schema 400. */
    content: z.string(),
  }),
  z.object({ source: z.literal('repo'), path: z.string().min(1).max(500) }),
]);

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<TaskDocumentRefusal, number> = {
  task_not_found: 404,
  document_not_found: 404,
  invalid_path: 400,
  file_not_found: 404,
  content_too_long: 413,
  empty_content: 400,
};

/** `/api/tasks/:id/documents` — withAuth does not forward route params. */
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

      const rawDocId = req.nextUrl.searchParams.get('docId');
      if (rawDocId !== null) {
        const docId = Number(rawDocId);
        if (!Number.isInteger(docId) || docId <= 0) {
          return NextResponse.json({ error: 'docId must be a positive integer' }, { status: 400 });
        }
        const result = await getTaskDocument(ctx.organizationId, taskId, docId);
        if (!result.ok) {
          return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
        }
        const payload: TaskDocumentPayload = { ok: true, document: result.document };
        return NextResponse.json(payload);
      }

      const documents = await listTaskDocuments(ctx.organizationId, taskId);
      if (!documents) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }
      const payload: TaskDocumentsPayload = { ok: true, documents };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/documents');
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
      const result = await createTaskDocument(ctx.organizationId, ctx.staffId, taskId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      if (result.created) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_DOC_ADD,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          after: { documentId: result.document.id },
          extra: {
            source: result.document.source,
            title: result.document.title,
            repoPath: result.document.repoPath,
          },
        });
      }

      return NextResponse.json(
        { ok: true, document: result.document },
        { status: result.created ? 201 : 200 },
      );
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/documents');
    }
  },
  { permission: 'work_orders.claim' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const docId = Number(req.nextUrl.searchParams.get('docId'));
      if (taskId === null || !Number.isInteger(docId) || docId <= 0) {
        return NextResponse.json(
          { error: 'task id and docId must be positive integers' },
          { status: 400 },
        );
      }

      const result = await deleteTaskDocument(ctx.organizationId, taskId, docId);
      if (!result) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }

      if (result.changed) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_DOC_REMOVE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: { documentId: docId },
          extra: {
            source: result.removed?.source ?? null,
            title: result.removed?.title ?? null,
            repoPath: result.removed?.repoPath ?? null,
          },
        });
      }

      return NextResponse.json({ ok: true, changed: result.changed });
    } catch (error) {
      return errorResponse(error, 'DELETE /api/tasks/[id]/documents');
    }
  },
  { permission: 'work_orders.claim' },
);

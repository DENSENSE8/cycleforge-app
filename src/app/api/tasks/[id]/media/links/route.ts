/** `/api/tasks/[id]/media/links` — photos and videos attached to a task by URL (unlisted YouTube, Vimeo, Loom, Google Drive, or a direct… */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { MEDIA_LINK_TITLE_MAX } from '@/lib/tasks/media-links';
import type { TaskMediaLinkRefusal } from '@/lib/tasks/task-media-links';
import {
  createTaskMediaLink,
  deleteTaskMediaLink,
  listTaskMediaLinks,
  updateTaskMediaLink,
} from '@/lib/tasks/task-media-links-db';

export const dynamic = 'force-dynamic';

/** Blank is "no caption" — the domain folds it to null after the trim. */
const Title = z.string().trim().max(MEDIA_LINK_TITLE_MAX).nullable().optional();

/**
 * URL shape is the parser's call (`invalid_url` / `unsupported_link`), not a
 * schema 400. Unknown keys (a client-sent `kind` / `embedUrl`) are stripped:
 * every derived column is recomputed server-side.
 */
const CreateBody = z.object({ url: z.string(), title: Title });

const PatchBody = z
  .object({ url: z.string().optional(), title: Title })
  .refine((body) => body.url !== undefined || body.title !== undefined, {
    message: 'Send url, title, or both',
  });

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<TaskMediaLinkRefusal, number> = {
  task_not_found: 404,
  link_not_found: 404,
  invalid_url: 400,
  unsupported_link: 400,
  duplicate_link: 409,
};

/** `/api/tasks/:id/media/links` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function linkIdFromQuery(req: NextRequest): number | null {
  const n = Number(req.nextUrl.searchParams.get('linkId'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const links = await listTaskMediaLinks(ctx.organizationId, taskId);
      if (!links) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, links });
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/media/links');
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
      const result = await createTaskMediaLink(ctx.organizationId, ctx.staffId, taskId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      if (result.created) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_MEDIA_LINK_ADD,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          after: { mediaLinkId: result.link.id, url: result.link.url, title: result.link.title },
          extra: { kind: result.link.kind, provider: result.link.provider },
        });
      }

      return NextResponse.json({ ok: true, link: result.link }, { status: result.created ? 201 : 200 });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/media/links');
    }
  },
  { permission: 'work_orders.claim' },
);

export const PATCH = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const linkId = linkIdFromQuery(req);
      if (taskId === null || linkId === null) {
        return NextResponse.json(
          { error: 'task id and linkId must be positive integers' },
          { status: 400 },
        );
      }
      const parsed = PatchBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const result = await updateTaskMediaLink(ctx.organizationId, taskId, linkId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      if (result.changed) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_MEDIA_LINK_UPDATE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: {
            mediaLinkId: linkId,
            url: result.before.url,
            provider: result.before.provider,
            title: result.before.title,
          },
          after: {
            mediaLinkId: linkId,
            url: result.link.url,
            provider: result.link.provider,
            title: result.link.title,
          },
        });
      }

      return NextResponse.json({ ok: true, link: result.link });
    } catch (error) {
      return errorResponse(error, 'PATCH /api/tasks/[id]/media/links');
    }
  },
  { permission: 'work_orders.claim' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      const linkId = linkIdFromQuery(req);
      if (taskId === null || linkId === null) {
        return NextResponse.json(
          { error: 'task id and linkId must be positive integers' },
          { status: 400 },
        );
      }

      const result = await deleteTaskMediaLink(ctx.organizationId, taskId, linkId);
      if (!result) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }

      if (result.changed) {
        await recordAudit(pool, ctx, req, {
          source: 'api',
          action: AUDIT_ACTION.WORK_TASK_MEDIA_LINK_REMOVE,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: taskId,
          before: {
            mediaLinkId: linkId,
            url: result.removed?.url ?? null,
            title: result.removed?.title ?? null,
          },
          extra: { kind: result.removed?.kind ?? null, provider: result.removed?.provider ?? null },
        });
      }

      return NextResponse.json({ ok: true, changed: result.changed });
    } catch (error) {
      return errorResponse(error, 'DELETE /api/tasks/[id]/media/links');
    }
  },
  { permission: 'work_orders.claim' },
);

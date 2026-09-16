import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import {
  createDailyCheckItemLink,
  dailyCheckItemExists,
  deleteDailyCheckItemLink,
  listDailyCheckItemLinks,
} from '@/lib/daily-checks/queries';
import { DAILY_CHECK_LINK_ENTITY_TYPES } from '@/lib/daily-checks/types';

export const runtime = 'nodejs';

const CreateBody = z
  .object({
    entityType: z.enum(DAILY_CHECK_LINK_ENTITY_TYPES),
    /** Absent/null on TRACKING — the tracking string rides `label`. */
    entityId: z.number().int().positive().nullish(),
    label: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.entityType === 'TRACKING') {
      if (body.entityId != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entityId'],
          message: 'a tracking link carries its value in label, not entityId',
        });
      }
      if (!body.label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['label'],
          message: 'the tracking number is required on a tracking link',
        });
      }
    } else if (body.entityId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entityId'],
        message: 'entityId is required for ticket and work-order links',
      });
    }
  });

/** `/api/daily-checks/items/:id/links` — withAuth does not forward route params. */
function itemIdFromPath(pathname: string): number | null {
  const parts = pathname.split('/').filter(Boolean);
  const i = parts.indexOf('items');
  const raw = i >= 0 ? parts[i + 1] : undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Connections on one daily-check item.
 *
 * GET    — list
 * POST   — attach a Zendesk ticket or work order
 * DELETE ?linkId= — detach
 *
 * Gate is `dashboard.view`: anyone who can run the list can name the ticket
 * they just opened against a check. Curating the LIST itself stays
 * `admin.manage_staff`.
 */
export const GET = withAuth(
  async (request, ctx) => {
    const itemId = itemIdFromPath(request.nextUrl.pathname);
    if (itemId == null) {
      return NextResponse.json({ error: 'id must be a positive integer' }, { status: 400 });
    }
    if (!(await dailyCheckItemExists({ orgId: ctx.organizationId, itemId }))) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    const links = await listDailyCheckItemLinks({ orgId: ctx.organizationId, itemId });
    return NextResponse.json({ links });
  },
  { permission: 'dashboard.view' },
);

export const POST = withAuth(
  async (request, ctx) => {
    const itemId = itemIdFromPath(request.nextUrl.pathname);
    if (itemId == null) {
      return NextResponse.json({ error: 'id must be a positive integer' }, { status: 400 });
    }
    const parsed = CreateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first?.message ?? 'entityType and entityId are required' },
        { status: 400 },
      );
    }
    if (!(await dailyCheckItemExists({ orgId: ctx.organizationId, itemId }))) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    try {
      const link = await createDailyCheckItemLink({
        orgId: ctx.organizationId,
        itemId,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId ?? null,
        label: parsed.data.label ?? null,
        createdByStaffId: ctx.staffId,
      });
      return NextResponse.json(link, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] link create failed:', message);
      return NextResponse.json({ error: 'Failed to attach the connection' }, { status: 500 });
    }
  },
  { permission: 'dashboard.view' },
);

export const DELETE = withAuth(
  async (request, ctx) => {
    const itemId = itemIdFromPath(request.nextUrl.pathname);
    const linkId = Number(request.nextUrl.searchParams.get('linkId'));
    if (itemId == null || !Number.isInteger(linkId) || linkId <= 0) {
      return NextResponse.json({ error: 'id and linkId must be positive integers' }, { status: 400 });
    }
    const removed = await deleteDailyCheckItemLink({
      orgId: ctx.organizationId,
      itemId,
      linkId,
    });
    return NextResponse.json({ ok: true, changed: removed });
  },
  { permission: 'dashboard.view' },
);

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { errorResponse } from '@/lib/api/errors';
import { parseBody } from '@/lib/schemas/parse';
import { StudioTemplateReviewBody } from '@/lib/schemas/studio';
import { reviewSubmittedTemplate } from '@/lib/studio/review-template';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/** POST /api/studio/catalog/submissions/[id]/review */
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../catalog/submissions/[id]/review → id is segments[-2]
  const id = Number(segments[segments.length - 2]);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid template id' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = parseBody(StudioTemplateReviewBody, raw ?? {});
  if (parsed instanceof NextResponse) return parsed;

  try {
    const outcome = await reviewSubmittedTemplate({ templateId: id, decision: parsed.decision });

    if (outcome.status === 200 && outcome.reviewed) {
      await recordAudit(pool, ctx, request, {
        source: 'studio.catalog.review',
        action: AUDIT_ACTION.WORKFLOW_TEMPLATE_REVIEW,
        entityType: AUDIT_ENTITY.WORKFLOW_TEMPLATE,
        entityId: outcome.templateId,
        method: 'manual',
        extra: {
          decision: parsed.decision,
          reviewStatus: outcome.reviewStatus,
          visibility: outcome.visibility,
          templateSlug: outcome.slug,
          name: outcome.name,
          note: parsed.note,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          templateId: outcome.templateId,
          reviewStatus: outcome.reviewStatus,
          visibility: outcome.visibility,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: false, error: outcome.reason ?? 'review failed' },
      { status: outcome.status },
    );
  } catch (err) {
    console.error('[POST /api/studio/catalog/submissions/[id]/review] error:', err);
    return errorResponse(err, 'studio.catalog.review');
  }
}, { permission: 'studio.catalog.review', feature: 'studio' });

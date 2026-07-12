/**
 * review-template — a curator approves or rejects a submitted catalog template
 * (Template Platform Phase 4). The moderation half of submit-template.
 *
 *   approve → review_status='approved', visibility='public'  (surfaced in the
 *             curated catalog, clonable by every tenant).
 *   reject  → review_status='rejected', visibility='private' (stays hidden).
 *
 * The transition is guarded: only a row currently review_status='submitted' moves
 * (the UPDATE's WHERE enforces it), so a double-review or a review of a
 * non-submitted row is a no-op → 409/404, never a silent re-flip. reviewed_at is
 * stamped on the transition.
 *
 * Deps-injected so it unit-tests DB-free: the guarded UPDATE is the only
 * collaborator (real impl by default).
 */

import pool from '@/lib/db';

export type ReviewDecision = 'approve' | 'reject';

export interface ReviewTemplateArgs {
  templateId: number;
  decision: ReviewDecision;
}

export interface ReviewTemplateResult {
  status: 200 | 404 | 409 | 500;
  reviewed: boolean;
  templateId: number;
  reviewStatus: 'approved' | 'rejected' | null;
  visibility: 'public' | 'private' | null;
  name: string | null;
  slug: string | null;
  reason?: string;
}

export interface ReviewTemplateDeps {
  /**
   * Apply the guarded review transition. Returns the updated row's name+slug, or
   * null when no submitted+non-system row with that id existed (already reviewed
   * or not found). MUST scope: is_system = FALSE AND review_status = 'submitted'.
   */
  applyReview: (
    templateId: number,
    next: { reviewStatus: 'approved' | 'rejected'; visibility: 'public' | 'private' },
  ) => Promise<{ name: string; slug: string } | null>;
}

async function applyReviewReal(
  templateId: number,
  next: { reviewStatus: 'approved' | 'rejected'; visibility: 'public' | 'private' },
): Promise<{ name: string; slug: string } | null> {
  const res = await pool.query<{ name: string; slug: string }>(
    `UPDATE workflow_templates
        SET review_status = $2, visibility = $3, reviewed_at = now()
      WHERE id = $1
        AND is_system = FALSE
        AND review_status = 'submitted'
      RETURNING name, slug`,
    [templateId, next.reviewStatus, next.visibility],
  );
  return res.rows[0] ?? null;
}

const defaultDeps: ReviewTemplateDeps = { applyReview: applyReviewReal };

export async function reviewSubmittedTemplate(
  args: ReviewTemplateArgs,
  deps: ReviewTemplateDeps = defaultDeps,
): Promise<ReviewTemplateResult> {
  const next =
    args.decision === 'approve'
      ? ({ reviewStatus: 'approved', visibility: 'public' } as const)
      : ({ reviewStatus: 'rejected', visibility: 'private' } as const);

  const row = await deps.applyReview(args.templateId, next);
  if (!row) {
    return {
      status: 409,
      reviewed: false,
      templateId: args.templateId,
      reviewStatus: null,
      visibility: null,
      name: null,
      slug: null,
      reason: 'template not found or not in a submitted state',
    };
  }

  return {
    status: 200,
    reviewed: true,
    templateId: args.templateId,
    reviewStatus: next.reviewStatus,
    visibility: next.visibility,
    name: row.name,
    slug: row.slug,
  };
}

/** recommend-template — rank EXISTING catalog templates against a shop's intake description (Template Platform Phase 5, the "recommend a… */

export interface IntakeProfile {
  /** Free-text description of how the shop runs ops (the onboarding intake). */
  text: string;
  /** Optional declared vertical/category (e.g. 'electronics'). */
  category?: string | null;
}

export interface TemplateCandidate {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  /** Distinct engine node types present in the template graph. */
  nodeTypes: string[];
}

export interface TemplateRecommendation {
  slug: string;
  /** 0..1 relevance score (deterministic core; a reranker may overwrite). */
  score: number;
  reason: string;
}

export interface RecommendTemplateResult {
  recommendations: TemplateRecommendation[];
}

export interface RecommendDeps {
  /**
   * Optional AI re-rank over the deterministic shortlist. MUST return only slugs
   * drawn from the shortlist it was given; the core filters its output back to
   * known slugs regardless, so a hallucinated slug can never surface.
   */
  rerank?: (
    intake: IntakeProfile,
    shortlist: TemplateRecommendation[],
    candidates: TemplateCandidate[],
  ) => Promise<TemplateRecommendation[]>;
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'we', 'i', 'our', 'my', 'with',
  'in', 'on', 'that', 'this', 'it', 'is', 'are', 'be', 'do', 'then', 'from', 'as',
]);

function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function scoreCandidate(intakeTokens: Set<string>, intakeCategory: string | null, c: TemplateCandidate): number {
  if (intakeTokens.size === 0 && !intakeCategory) return 0;

  const haystack = new Set([
    ...tokenize(c.name),
    ...tokenize(c.description),
    ...tokenize(c.category),
    ...c.nodeTypes.flatMap((t) => tokenize(t)),
  ]);

  let overlap = 0;
  for (const t of intakeTokens) if (haystack.has(t)) overlap += 1;

  // Token-overlap component, normalized by the intake size so a longer intake
  // doesn't inflate every score.
  const denom = Math.max(1, intakeTokens.size);
  let score = overlap / denom;

  // Exact category match is a strong signal — bump and clamp.
  if (intakeCategory && c.category && intakeCategory.toLowerCase() === c.category.toLowerCase()) {
    score = Math.min(1, score + 0.5);
  }
  return score;
}

/** Rank the candidate templates for the intake. */
export async function recommendTemplates(
  intake: IntakeProfile,
  candidates: TemplateCandidate[],
  deps: RecommendDeps = {},
  limit = 3,
): Promise<RecommendTemplateResult> {
  const intakeTokens = new Set(tokenize(intake.text));
  const intakeCategory = intake.category?.trim() || null;

  const scored: TemplateRecommendation[] = candidates
    .map((c) => {
      const score = scoreCandidate(intakeTokens, intakeCategory, c);
      const matched =
        intakeCategory && c.category && intakeCategory.toLowerCase() === c.category.toLowerCase();
      const reason = matched
        ? `matches your "${c.category}" category`
        : score > 0
          ? 'matches your described workflow'
          : 'a general starting point';
      return { slug: c.slug, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  const shortlist = scored.slice(0, Math.max(limit, 0));

  if (!deps.rerank) {
    return { recommendations: shortlist };
  }

  const known = new Set(candidates.map((c) => c.slug));
  const reranked = await deps.rerank(intake, shortlist, candidates);
  // Safety: keep only slugs that actually exist; de-dupe; cap at limit.
  const seen = new Set<string>();
  const safe = reranked.filter((r) => {
    if (!known.has(r.slug) || seen.has(r.slug)) return false;
    seen.add(r.slug);
    return true;
  });
  return { recommendations: safe.slice(0, Math.max(limit, 0)) };
}

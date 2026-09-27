/**
 * Brand backfill — the deterministic proposer (pure) and its runner
 * (deps-injected). Order and thresholds are phase0-findings §"Recommended
 * backfill order + thresholds":
 *
 *   1 Zoho items.brand (else manufacturer), exact alias ........ zoho 1.00  auto
 *   2 identity-title leading alias, brand/franchise ........... title 0.95  auto
 *   3 identity-title leading alias, product_line .............. product_line 0.90 auto
 *   4 parent SKU (prefix before the first '-') branded >= 0.95 . parent 0.90 auto
 *   5 listing-title leading alias ............................. listing 0.60 review
 *   6 "for / fits / compatible with <Brand>" mention .......... compat 0.30 review
 *   conflict between two sources >= 0.60 (different root brand): the
 *   higher-authority source applies and the disagreeing one is queued as
 *   the pair (Zoho over title; title / line / parent over a listing).
 *
 * Auto-apply threshold 0.90 (SKU_BRAND_FACT_MIN_CONFIDENCE). Everything else
 * goes to the approval-first review queue (agent_mutations, LAWS T28) and is
 * applied only by a human. The title tokenised is the RESOLVED identity title
 * (Zoho item name governs), never raw sku_catalog.product_title.
 */

import { resolveSkuIdentityTitle, SKU_BRAND_FACT_MIN_CONFIDENCE } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  brandTokens,
  compatTargetStart,
  longestAliasAt,
  normalizeBrandName,
  normalizeManufacturerField,
  stripLeadingStopWords,
  type BrandKind,
} from './normalize';

export const BRAND_SOURCE_CONFIDENCE = {
  zoho: 1,
  title: 0.95,
  product_line: 0.9,
  parent: 0.9,
  listing: 0.6,
  compat: 0.3,
} as const;

export type ProposerSource = keyof typeof BRAND_SOURCE_CONFIDENCE;
export type SkuBrandSource = ProposerSource | 'operator' | 'agent';

/** Who may overwrite whom: a derived value never replaces a higher-authority one. */
export const SKU_BRAND_SOURCE_AUTHORITY: Record<SkuBrandSource, number> = {
  operator: 6,
  agent: 5,
  zoho: 4,
  title: 3,
  product_line: 3,
  parent: 2,
  listing: 1,
  compat: 0,
};

/** Parent inheritance needs a parent fact at least this strong. */
const PARENT_MIN_CONFIDENCE = 0.95;
/** Two sources at or above this that disagree are a conflict. */
const CONFLICT_MIN_CONFIDENCE = 0.6;

export interface BrandAliasEntry {
  normalizedAlias: string;
  brandId: number;
  brandName: string;
  kind: BrandKind;
  /** Top ancestor id — conflicts compare roots, so Wave vs Bose agree. */
  rootBrandId: number;
  reviewOnly: boolean;
}

export interface BackfillSku {
  skuCatalogId: number;
  sku: string;
  isActive: boolean;
  zohoItemTitle: string | null;
  catalogProductTitle: string | null;
  zohoBrand: string | null;
  zohoManufacturer: string | null;
  listingTitles: string[];
  current: { brandId: number | null; confidence: number | null; source: string | null };
}

export interface BrandCandidate {
  brandId: number;
  brandName: string;
  rootBrandId: number;
  source: ProposerSource;
  confidence: number;
  /** The normalised text that hit, for the "why" line. */
  matched: string;
}

export type ReviewReason = 'below_threshold' | 'conflict' | 'conflict_with_zoho' | 'review_only_alias' | 'compat_mention';

export interface SkuBrandProposal {
  /** null for a compat mention: the target is NOT the brand; the reviewer picks one. */
  brandId: number | null;
  brandName: string | null;
  source: ProposerSource;
  confidence: number;
  reason: ReviewReason;
  matched: string;
  /** Compatibility target of a "for <Brand>" title. */
  compatBrandId?: number;
  suggestion?: string;
  /** Stable key so re-runs never duplicate (or re-open a rejected) proposal. */
  dedupeKey: string;
}

export interface SkuBrandPlan {
  skuCatalogId: number;
  sku: string;
  isActive: boolean;
  fixture: boolean;
  /** The write the runner performs (>= threshold, allowed by authority, and a real change). */
  apply: BrandCandidate | null;
  /** Why nothing is written when a candidate existed. */
  kept: 'unchanged' | 'protected' | null;
  proposals: SkuBrandProposal[];
  /** Zoho brand text with no alias in this org → a brand.create proposal. */
  unknownZohoBrand: string | null;
  /** Brand fact the SKU carries after the run (for coverage). */
  finalBrandId: number | null;
}

export interface ZohoBrandCreateProposal {
  name: string;
  normalizedName: string;
  skuCatalogIds: number[];
  dedupeKey: string;
}

const FIXTURE_SKU = /^(E2E|AUDITSKU|QA-|DUPSKU|CF-|SKU-E2E|TMP-QA)/i;
const FIXTURE_TITLE = /^(e2e|qa |audit test|dup probe|r2$|probe|verify)/i;

/** Test fixtures that pollute coverage numbers (phase0 audit predicate, minus the org clause). */
export function isFixtureSku(sku: string, title: string): boolean {
  return FIXTURE_SKU.test(sku.trim()) || FIXTURE_TITLE.test(title.trim());
}

function skuDedupeKey(skuCatalogId: number, brandId: number | null, source: string, reason: string): string {
  return `sku_brand:${skuCatalogId}:${brandId ?? 'none'}:${source}:${reason}`;
}

function candidateFrom(entry: BrandAliasEntry, source: ProposerSource, matched: string): BrandCandidate {
  return {
    brandId: entry.brandId,
    brandName: entry.brandName,
    rootBrandId: entry.rootBrandId,
    source,
    confidence: BRAND_SOURCE_CONFIDENCE[source],
    matched,
  };
}

function proposalFrom(skuCatalogId: number, c: BrandCandidate, reason: ReviewReason): SkuBrandProposal {
  return {
    brandId: c.brandId,
    brandName: c.brandName,
    source: c.source,
    confidence: c.confidence,
    reason,
    matched: c.matched,
    dedupeKey: skuDedupeKey(skuCatalogId, c.brandId, c.source, reason),
  };
}

/** Leading alias of a title after stripping listing noise; review-only hits included. */
function leadingAlias(
  title: string,
  index: ReadonlyMap<string, BrandAliasEntry>,
): { entry: BrandAliasEntry; ngram: string } | null {
  const tokens = stripLeadingStopWords(brandTokens(title));
  const hit = longestAliasAt(tokens, 0, (g) => index.get(g));
  return hit ? { entry: hit.entry, ngram: hit.ngram } : null;
}

function differentRoot(a: BrandCandidate, b: BrandCandidate): boolean {
  return a.rootBrandId !== b.rootBrandId;
}

/**
 * The higher-authority candidate applies; every listing brand that disagrees
 * with it (different root, >= 0.60) is logged to the queue as the pair, so a
 * human sees the contradiction. Phase0 found every such pair to be an Ecwid
 * leading-zero mispair, so the listing never blocks the stronger source.
 */
function queueDisagreements(plan: SkuBrandPlan, applied: BrandCandidate, listing: readonly BrandCandidate[]): void {
  for (const c of listing) {
    if (differentRoot(c, applied) && c.confidence >= CONFLICT_MIN_CONFIDENCE) {
      plan.proposals.push(proposalFrom(plan.skuCatalogId, c, 'conflict'));
    }
  }
}

/**
 * Plan every SKU. Pure: same inputs → same plans, which is what makes the
 * runner idempotent (unchanged rows are `kept`, proposals carry dedupe keys).
 */
export function planSkuBrands(
  skus: readonly BackfillSku[],
  aliases: readonly BrandAliasEntry[],
): { plans: SkuBrandPlan[]; zohoBrandCreates: ZohoBrandCreateProposal[] } {
  const index = new Map(aliases.map((a) => [a.normalizedAlias, a]));
  const bySku = new Map(skus.map((s) => [s.sku.trim(), s]));
  const plans: SkuBrandPlan[] = [];
  const pendingParent: Array<{ plan: SkuBrandPlan; row: BackfillSku; listing: BrandCandidate[] }> = [];

  for (const row of skus) {
    const title = resolveSkuIdentityTitle({
      zoho_item_title: row.zohoItemTitle,
      catalog_product_title: row.catalogProductTitle,
    });
    const plan: SkuBrandPlan = {
      skuCatalogId: row.skuCatalogId,
      sku: row.sku,
      isActive: row.isActive,
      fixture: isFixtureSku(row.sku, title),
      apply: null,
      kept: null,
      proposals: [],
      unknownZohoBrand: null,
      finalBrandId: null,
    };
    plans.push(plan);

    // 1. Zoho brand / manufacturer — exact alias after folding corporate tails.
    let zoho: BrandCandidate | null = null;
    const zohoRaw = (row.zohoBrand?.trim() || row.zohoManufacturer?.trim()) ?? '';
    if (zohoRaw) {
      const keys = [normalizeManufacturerField(zohoRaw), normalizeBrandName(zohoRaw)];
      const entry = keys.map((k) => index.get(k)).find((e) => e && !e.reviewOnly);
      if (entry) zoho = candidateFrom(entry, 'zoho', normalizeManufacturerField(zohoRaw));
      else plan.unknownZohoBrand = zohoRaw;
    }

    // 2/3. Identity-title leading alias.
    let own: BrandCandidate | null = null;
    const lead = title ? leadingAlias(title, index) : null;
    if (lead && !lead.entry.reviewOnly) {
      own = candidateFrom(lead.entry, lead.entry.kind === 'product_line' ? 'product_line' : 'title', lead.ngram);
    }

    // 5. Listing titles (untrusted — Ecwid pairing strips leading zeros).
    const listing: BrandCandidate[] = [];
    for (const lt of row.listingTitles) {
      const hit = leadingAlias(lt, index);
      if (hit && !hit.entry.reviewOnly && !listing.some((c) => c.brandId === hit.entry.brandId)) {
        listing.push(candidateFrom(hit.entry, 'listing', hit.ngram));
      }
    }

    if (zoho) {
      plan.apply = zoho;
      if (own && differentRoot(own, zoho)) plan.proposals.push(proposalFrom(row.skuCatalogId, own, 'conflict_with_zoho'));
      continue;
    }
    // The Zoho item governs: an unmapped Zoho brand holds the SKU until its
    // brand.create proposal is decided, whatever the title says.
    if (plan.unknownZohoBrand) continue;
    if (own) {
      plan.apply = own;
      queueDisagreements(plan, own, listing);
      continue;
    }

    // Title fallbacks that never auto-apply; parent inheritance (4) may still win below.
    if (lead?.entry.reviewOnly) {
      // An ambiguous alias ("sl") is evidence, not a fact: queued at listing strength.
      const ambiguous = { ...candidateFrom(lead.entry, 'title', lead.ngram), confidence: BRAND_SOURCE_CONFIDENCE.listing };
      plan.proposals.push(proposalFrom(row.skuCatalogId, ambiguous, 'review_only_alias'));
    }
    pendingParent.push({ plan, row, listing });
  }

  // 4. Parent SKU inheritance, from the fact the parent will carry after this run.
  const planById = new Map(plans.map((p) => [p.skuCatalogId, p]));
  const brandById = new Map(aliases.map((a) => [a.brandId, a]));
  const factOf = (sku: string): { brandId: number; brandName: string; rootBrandId: number } | null => {
    const parentRow = bySku.get(sku);
    if (!parentRow) return null;
    const cur = parentRow.current;
    const curAuthority = SKU_BRAND_SOURCE_AUTHORITY[cur.source as SkuBrandSource] ?? -1;
    const planned = planById.get(parentRow.skuCatalogId)?.apply ?? null;
    const currentFact =
      cur.brandId != null && (cur.confidence ?? 0) >= PARENT_MIN_CONFIDENCE ? brandById.get(cur.brandId) ?? null : null;
    if (planned && !(currentFact && curAuthority > SKU_BRAND_SOURCE_AUTHORITY[planned.source])) {
      return planned.confidence >= PARENT_MIN_CONFIDENCE ? planned : null;
    }
    return currentFact;
  };

  for (const { plan, row, listing } of pendingParent) {
    const parentSku = row.sku.trim().split('-')[0] ?? '';
    const parent = parentSku && parentSku !== row.sku.trim() ? factOf(parentSku) : null;
    if (parent) {
      const inherited: BrandCandidate = {
        brandId: parent.brandId,
        brandName: parent.brandName,
        rootBrandId: parent.rootBrandId,
        source: 'parent',
        confidence: BRAND_SOURCE_CONFIDENCE.parent,
        matched: parentSku,
      };
      plan.apply = inherited;
      plan.proposals = [];
      queueDisagreements(plan, inherited, listing);
      continue;
    }
    if (plan.proposals.length) continue; // review-only title alias already queued
    if (listing.length === 1) {
      plan.proposals.push(proposalFrom(row.skuCatalogId, listing[0]!, 'below_threshold'));
      continue;
    }
    if (listing.length > 1) {
      plan.proposals.push(proposalFrom(row.skuCatalogId, listing[0]!, 'conflict'));
      continue;
    }
    // 6. Compatibility mention — the target is not the brand.
    const tokens = brandTokens(
      resolveSkuIdentityTitle({ zoho_item_title: row.zohoItemTitle, catalog_product_title: row.catalogProductTitle }),
    );
    const start = compatTargetStart(tokens);
    const target = start >= 0 ? longestAliasAt(tokens, start, (g) => index.get(g)) : null;
    if (target && !target.entry.reviewOnly) {
      plan.proposals.push({
        brandId: null,
        brandName: null,
        source: 'compat',
        confidence: BRAND_SOURCE_CONFIDENCE.compat,
        reason: 'compat_mention',
        matched: target.ngram,
        compatBrandId: target.entry.brandId,
        suggestion: `Compatibility title ("for ${target.entry.brandName}"): the brand is a third party or the house brand, not ${target.entry.brandName}. Pick the brand when approving.`,
        dedupeKey: skuDedupeKey(row.skuCatalogId, null, 'compat', 'compat_mention'),
      });
    }
  }

  // Authority + idempotency: never overwrite a stronger source; skip no-ops.
  const rowById = new Map(skus.map((s) => [s.skuCatalogId, s]));
  for (const plan of plans) {
    const cur = rowById.get(plan.skuCatalogId)!.current;
    const curSource = (cur.source ?? null) as SkuBrandSource | null;
    if (plan.apply) {
      const next = plan.apply;
      if (curSource && cur.brandId != null && SKU_BRAND_SOURCE_AUTHORITY[curSource] > SKU_BRAND_SOURCE_AUTHORITY[next.source]) {
        plan.kept = 'protected';
        plan.apply = null;
      } else if (cur.brandId === next.brandId && curSource === next.source && Number(cur.confidence) === next.confidence) {
        plan.kept = 'unchanged';
        plan.apply = null;
      }
    }
    // A human-decided fact (operator / approved agent) is settled: no proposals against it.
    if (curSource && cur.brandId != null && SKU_BRAND_SOURCE_AUTHORITY[curSource] >= SKU_BRAND_SOURCE_AUTHORITY.agent) {
      plan.proposals = [];
      plan.unknownZohoBrand = null;
    }
    const keptFact = cur.brandId != null && (cur.confidence ?? 0) >= SKU_BRAND_FACT_MIN_CONFIDENCE ? cur.brandId : null;
    plan.finalBrandId = plan.apply ? plan.apply.brandId : keptFact;
  }

  const creates = new Map<string, ZohoBrandCreateProposal>();
  for (const plan of plans) {
    if (!plan.unknownZohoBrand) continue;
    const normalizedName = normalizeManufacturerField(plan.unknownZohoBrand);
    if (!normalizedName) continue;
    const entry = creates.get(normalizedName) ?? {
      name: plan.unknownZohoBrand,
      normalizedName,
      skuCatalogIds: [],
      dedupeKey: `brand_create:zoho:${normalizedName}`,
    };
    entry.skuCatalogIds.push(plan.skuCatalogId);
    creates.set(normalizedName, entry);
  }

  return { plans, zohoBrandCreates: [...creates.values()] };
}

export interface CoverageRow {
  population: 'all' | 'active' | 'active_non_fixture' | 'non_fixture';
  total: number;
  branded: number;
  pct: number;
}

/** Share of SKUs carrying a brand fact after the run, per population. */
export function brandCoverage(plans: readonly SkuBrandPlan[]): CoverageRow[] {
  const pops: Array<[CoverageRow['population'], (p: SkuBrandPlan) => boolean]> = [
    ['all', () => true],
    ['non_fixture', (p) => !p.fixture],
    ['active', (p) => p.isActive],
    ['active_non_fixture', (p) => p.isActive && !p.fixture],
  ];
  return pops.map(([population, pick]) => {
    const rows = plans.filter(pick);
    const branded = rows.filter((p) => p.finalBrandId != null).length;
    return { population, total: rows.length, branded, pct: rows.length ? Math.round((branded / rows.length) * 1000) / 10 : 0 };
  });
}

// ─── runner ───────────────────────────────────────────────────────────────────

export interface BackfillApplyRow {
  skuCatalogId: number;
  brandId: number;
  confidence: number;
  source: SkuBrandSource;
}

export interface BrandBackfillDeps {
  loadAliases: (orgId: OrgId) => Promise<BrandAliasEntry[]>;
  loadSkus: (orgId: OrgId) => Promise<BackfillSku[]>;
  /** dedupe keys of brand proposals already pending or rejected. */
  loadProposalKeys: (orgId: OrgId) => Promise<Set<string>>;
  /** One authority-guarded batch write; returns rows changed. */
  writeBrands: (orgId: OrgId, rows: BackfillApplyRow[]) => Promise<number>;
  propose: (
    orgId: OrgId,
    kind: 'sku_brand.assign' | 'brand.create',
    payload: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export interface BackfillReport {
  orgId: OrgId;
  applied: boolean;
  skus: number;
  toApply: number;
  written: number;
  bySource: Record<string, number>;
  kept: { unchanged: number; protected: number };
  proposals: { new: number; alreadyQueued: number; brandCreates: number; failed: number };
  coverage: CoverageRow[];
  plans: SkuBrandPlan[];
  zohoBrandCreates: ZohoBrandCreateProposal[];
}

export async function runBrandBackfill(
  orgId: OrgId,
  opts: { apply: boolean },
  deps: BrandBackfillDeps,
): Promise<BackfillReport> {
  const [aliases, skus] = await Promise.all([deps.loadAliases(orgId), deps.loadSkus(orgId)]);
  const { plans, zohoBrandCreates } = planSkuBrands(skus, aliases);

  const applyRows: BackfillApplyRow[] = plans
    .filter((p) => p.apply)
    .map((p) => ({ skuCatalogId: p.skuCatalogId, brandId: p.apply!.brandId, confidence: p.apply!.confidence, source: p.apply!.source }));
  const bySource: Record<string, number> = {};
  for (const r of applyRows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;

  const report: BackfillReport = {
    orgId,
    applied: opts.apply,
    skus: skus.length,
    toApply: applyRows.length,
    written: 0,
    bySource,
    kept: {
      unchanged: plans.filter((p) => p.kept === 'unchanged').length,
      protected: plans.filter((p) => p.kept === 'protected').length,
    },
    proposals: { new: 0, alreadyQueued: 0, brandCreates: 0, failed: 0 },
    coverage: brandCoverage(plans),
    plans,
    zohoBrandCreates,
  };

  const queued = await deps.loadProposalKeys(orgId);
  const skuProposals = plans.flatMap((p) => p.proposals.map((pr) => ({ plan: p, pr })));
  const fresh = skuProposals.filter(({ pr }) => !queued.has(pr.dedupeKey));
  const freshCreates = zohoBrandCreates.filter((c) => !queued.has(c.dedupeKey));
  report.proposals.alreadyQueued = skuProposals.length - fresh.length + (zohoBrandCreates.length - freshCreates.length);
  report.proposals.new = fresh.length;
  report.proposals.brandCreates = freshCreates.length;

  if (!opts.apply) return report;

  report.written = applyRows.length ? await deps.writeBrands(orgId, applyRows) : 0;

  for (const { plan, pr } of fresh) {
    const r = await deps.propose(orgId, 'sku_brand.assign', {
      skuCatalogId: plan.skuCatalogId,
      sku: plan.sku,
      brandId: pr.brandId,
      brandName: pr.brandName,
      source: pr.source,
      confidence: pr.confidence,
      reason: pr.reason,
      matched: pr.matched,
      ...(pr.compatBrandId != null ? { compatBrandId: pr.compatBrandId } : {}),
      ...(pr.suggestion ? { suggestion: pr.suggestion } : {}),
      dedupeKey: pr.dedupeKey,
    });
    if (!r.ok) report.proposals.failed += 1;
  }
  for (const c of freshCreates) {
    const r = await deps.propose(orgId, 'brand.create', {
      name: c.name,
      kind: 'brand',
      aliases: [c.name],
      aliasSource: 'zoho',
      assignSkuCatalogIds: c.skuCatalogIds,
      dedupeKey: c.dedupeKey,
    });
    if (!r.ok) report.proposals.failed += 1;
  }
  return report;
}

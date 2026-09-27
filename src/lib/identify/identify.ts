/**
 * `identify` — anything pasted or scanned → ranked candidates per line.
 *
 * ONE round trip (`tenantQueryOneTrip`) answers a paste: every exact probe of
 * every line, plus — for the lines that are words (`bose 700 used`) — the
 * brand-alias match, the brand arm, the keyword/typo/trigram arms and the
 * enrichment. A second trip happens only for an identifier-shaped line that
 * missed every exact probe (`PS48`), which then searches as free text.
 */

import { createHash } from 'node:crypto';
import { sqlSkuBrandJson, type BrandTokenMatch } from '@/lib/brands/lookup';
import { aliasNgrams, brandTokens } from '@/lib/brands/normalize';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';
import { createCacheLookupKey, getOrSet } from '@/lib/cache/upstash-cache';
import { CONDITION_GRADES, resolveConditionGrade, type ConditionGrade } from '@/lib/conditions';
import type { DeskViewId } from '@/lib/outbound/desk-views';
import { rrfMerge, type DocHitRow } from '@/lib/search/hybrid-retrieval';
import { pageContextToEntityTypes } from '@/lib/search/page-context';
import { recordSearchQueries } from '@/lib/search/query-log';
import { toDbEntityType, toUiEntityType } from '@/lib/search/search-hit';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { identifyActions } from './actions';
import {
  classifyIdentifyLine,
  splitIdentifyBatch,
  typoVariants,
  type ClassifiedLine,
  type ExactProbe,
} from './classify';
import { IDENTIFY_TIERS, compareCandidates, contextLevel, type IdentifyContextScope, type RankKey } from './rank';
import { recordHref } from './record-href';
import {
  IDENTIFY_DEFAULT_LIMIT,
  IdentifyBrandSchema,
  type IdentifyBrand,
  type IdentifyCandidate,
  type IdentifyKind,
  type IdentifyLine,
  type IdentifyMatchField,
  type IdentifyRequest,
  type IdentifyResponse,
  type IdentifyStage,
} from './schema';
import { buildIdentifyStatement, type FreeTextLine, type IdentifyRow } from './sql';

export interface IdentifyDeps {
  /** One statement, one round trip, tenant-scoped. */
  query(orgId: OrgId, sql: string, params: unknown[]): Promise<{ rows: IdentifyRow[] }>;
  /** Brand jsonb subquery over the joined catalog row `sc`. */
  brandSql: string;
  /** Per-org read-through cache for a whole answer. */
  cache(orgId: OrgId, key: string, load: () => Promise<IdentifyResponse>): Promise<IdentifyResponse>;
}

/** Identify answers change as orders move; tags drop them sooner on any write. */
const IDENTIFY_CACHE_TTL_SECONDS = 60;
const IDENTIFY_CACHE_TAGS = [
  CACHE_TAGS.orders,
  CACHE_TAGS.skuCatalog,
  CACHE_TAGS.receivingLogs,
  CACHE_TAGS.fbaFnskus,
  CACHE_TAGS.techLogs,
];

export const defaultIdentifyDeps: IdentifyDeps = {
  query: (orgId, sql, params) => tenantQueryOneTrip<IdentifyRow>(orgId, sql, params),
  brandSql: sqlSkuBrandJson('sc'),
  cache: (orgId, key, load) =>
    getOrSet(CACHE_NS.identify, orgId, key, IDENTIFY_CACHE_TTL_SECONDS, IDENTIFY_CACHE_TAGS, load),
};

// ── Context ─────────────────────────────────────────────────────────────────

/** Outbound sidebar sections that ARE a workflow stage. */
const SECTION_STAGE: Record<string, IdentifyStage> = {
  'outbound.exceptions': 'exception',
  'outbound.shortage': 'picking',
  'outbound.orders': 'to_ship',
  'outbound.shipped': 'shipped',
};

/** `context` (`<pageId>[.<sectionId>]`) → the kinds (and stage) ranked first. */
export function identifyContextScope(context: string | null | undefined): IdentifyContextScope | null {
  if (!context) return null;
  const [pageId] = context.split('.');
  const types = pageContextToEntityTypes(`/${pageId}`);
  if (!types) return null;
  return { kinds: types.map(toUiEntityType), stage: SECTION_STAGE[context] ?? null };
}

// ── Row → candidate facts ───────────────────────────────────────────────────

const DESK_VIEW_STAGE: Record<DeskViewId, IdentifyStage> = {
  exceptions: 'exception',
  po: 'picking',
  pick: 'picking',
  triage: 'to_ship',
  shipped: 'shipped',
};

const UNIT_STATUS_STAGE: Record<string, IdentifyStage> = {
  ON_HOLD: 'exception',
  ALLOCATED: 'picking',
  PICKING: 'picking',
  PICKED: 'picking',
  PACKING: 'to_ship',
  PACKED: 'to_ship',
  LABELED: 'to_ship',
  STAGED: 'to_ship',
  LOADING: 'to_ship',
  SHIPPED: 'shipped',
  RECEIVED: 'receiving',
  TRIAGED: 'receiving',
};

interface Facts {
  kind: IdentifyKind;
  entityId: number;
  title: string;
  subtitle: string | null;
  brand: IdentifyBrand | null;
  stage: IdentifyStage | null;
  deskView: DeskViewId | null;
  condition: ConditionGrade | null;
  happenedAt: number | null;
  href: string;
  actions: IdentifyCandidate['actions'];
}

function joinFaces(...parts: Array<string | null | undefined>): string | null {
  const faces = parts.map((p) => String(p ?? '').trim()).filter(Boolean);
  return faces.length > 0 ? faces.join(' · ') : null;
}

function asGrade(raw: string | null): ConditionGrade | null {
  const resolved = resolveConditionGrade(raw);
  return (CONDITION_GRADES as readonly string[]).includes(resolved) ? (resolved as ConditionGrade) : null;
}

function factsOf(row: IdentifyRow): Facts | null {
  const kind = row.kind as IdentifyKind;
  const entityId = Number(row.entity_id);
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return null;
  const deskView = kind === 'order' ? ((row.desk_view as DeskViewId | null) ?? null) : null;
  const shipmentId = row.shipment_id == null ? null : Number(row.shipment_id);
  const skuTitle = resolveSkuIdentityTitle({
    zoho_item_title: row.zoho_title,
    catalog_product_title: row.catalog_title,
    item_name: kind === 'order' ? row.order_title : null,
    sku: row.sku,
  });

  let title: string;
  let subtitle: string | null;
  let stage: IdentifyStage | null = null;
  let condition: ConditionGrade | null = asGrade(row.doc_condition);
  switch (kind) {
    case 'order':
      title = skuTitle || row.doc_title || row.order_id || `Order #${entityId}`;
      subtitle = joinFaces(row.order_id, row.account_source);
      stage = deskView ? DESK_VIEW_STAGE[deskView] : null;
      condition = asGrade(row.order_condition) ?? condition;
      break;
    case 'sku':
      title = skuTitle || row.doc_title || `SKU #${entityId}`;
      subtitle = row.sku ?? row.doc_subtitle;
      break;
    case 'unit':
      title = skuTitle || row.doc_title || row.unit_serial || `Unit #${entityId}`;
      subtitle = joinFaces(row.unit_serial, row.unit_status);
      stage = row.unit_status ? (UNIT_STATUS_STAGE[row.unit_status] ?? null) : null;
      condition = asGrade(row.unit_condition) ?? condition;
      break;
    case 'receiving':
      title = row.doc_title || (row.receiving_po ? `PO ${row.receiving_po}` : `Receiving #${entityId}`);
      subtitle = joinFaces(row.receiving_po ? `PO ${row.receiving_po}` : null, row.receiving_tracking) ?? row.doc_subtitle;
      stage = 'receiving';
      break;
    case 'repair':
      title = row.repair_title || row.doc_title || `Repair #${entityId}`;
      subtitle = row.repair_ticket ?? row.doc_subtitle;
      break;
    case 'location':
      title = row.location_label || row.doc_title || `Location #${entityId}`;
      subtitle = row.doc_subtitle;
      break;
    default:
      title = row.doc_title || `${kind} #${entityId}`;
      subtitle = row.doc_subtitle;
  }

  const brand = IdentifyBrandSchema.safeParse(row.brand);
  const happened = row.happened_at == null ? NaN : new Date(row.happened_at).getTime();
  const href = recordHref({ kind, entityId, deskView, shipmentId });
  return {
    kind,
    entityId,
    title,
    subtitle,
    brand: brand.success ? brand.data : null,
    stage,
    deskView,
    condition,
    happenedAt: Number.isFinite(happened) ? happened : null,
    href,
    actions: identifyActions({
      kind,
      entityId,
      deskView,
      shipmentId,
      hasTechScan: Boolean(row.has_tech_scan),
      packed: Boolean(row.packed),
      staged: Boolean(row.staged),
      outOfStock: Boolean(row.out_of_stock),
      sku: row.sku,
      tracking: row.receiving_tracking,
    }),
  };
}

// ── Per-line assembly ───────────────────────────────────────────────────────

interface Scored extends RankKey {
  facts: Facts;
  confidence: number;
  matchedOn: { field: IdentifyMatchField; token: string };
}

function brandMatches(brand: IdentifyBrand | null, hits: BrandTokenMatch[]): boolean {
  if (!brand) return false;
  return hits.some((h) => h.brandId === brand.id || h.brandId === brand.root?.id);
}

/** Exact rows → one scored candidate per entity (the strongest probe wins). */
function exactCandidates(line: ClassifiedLine, rows: IdentifyRow[]): Scored[] {
  const byProbe = new Map<string, ExactProbe>();
  for (const p of line.probes) {
    const key = `${p.kind}:${p.value}`;
    const prev = byProbe.get(key);
    if (!prev || p.prior > prev.prior) byProbe.set(key, p);
  }
  const out = new Map<string, Scored>();
  for (const row of rows) {
    const probe = byProbe.get(`${row.probe}:${row.value}`);
    if (!probe) continue;
    const facts = factsOf(row);
    if (!facts) continue;
    const key = `${facts.kind}:${facts.entityId}`;
    const prev = out.get(key);
    if (prev && prev.confidence >= probe.prior) continue;
    out.set(key, {
      kind: facts.kind,
      entityId: facts.entityId,
      tier: IDENTIFY_TIERS.exact,
      contextLevel: 0,
      score: probe.prior,
      happenedAt: facts.happenedAt,
      facts,
      confidence: probe.prior,
      matchedOn: { field: probe.field, token: probe.token },
    });
  }
  // A printed ticket handle IS the ticket id — nothing to look up.
  for (const p of line.probes) {
    const id = Number(p.value);
    if (p.kind !== 'ticket' || !Number.isSafeInteger(id) || id <= 0) continue;
    const facts: Facts = {
      kind: 'ticket',
      entityId: id,
      title: `Support ticket #${id}`,
      subtitle: null,
      brand: null,
      stage: null,
      deskView: null,
      condition: null,
      happenedAt: null,
      href: recordHref({ kind: 'ticket', entityId: id }),
      actions: [{ id: 'open', label: 'Open' }],
    };
    out.set(`ticket:${id}`, {
      kind: 'ticket',
      entityId: id,
      tier: IDENTIFY_TIERS.exact,
      contextLevel: 0,
      score: p.prior,
      happenedAt: null,
      facts,
      confidence: p.prior,
      matchedOn: { field: p.field, token: p.token },
    });
  }
  return [...out.values()];
}

const DOC_FIELDS = {
  title: '',
  subtitle: null,
  status: null,
  condition_grade: null,
  source_platform: null,
  tracking_number: null,
  carrier: null,
  serial_number: null,
  happened_at: null,
} as const;

/** Free-text rows → candidates: RRF across the arms, then tiered by how they matched. */
function freeTextCandidates(line: ClassifiedLine, rows: IdentifyRow[], brandHits: BrandTokenMatch[]): Scored[] {
  const arms: Record<string, IdentifyRow[]> = { keyword_sku: [], keyword_doc: [], fuzzy_sku: [], brand_sku: [] };
  const corrections: string[] = [];
  for (const row of rows) {
    if (row.arm === 'correction') corrections.push(String(row.value));
    else if (row.arm in arms) arms[row.arm].push(row);
  }
  for (const arm of Object.values(arms)) arm.sort((a, b) => a.arm_rank - b.arm_rank);

  const toDoc = (row: IdentifyRow): DocHitRow => ({
    ...DOC_FIELDS,
    entity_type: toDbEntityType(row.kind as IdentifyKind),
    entity_id: Number(row.entity_id),
  });
  const fused = rrfMerge(Object.values(arms).map((arm) => arm.map(toDoc)), Number.MAX_SAFE_INTEGER);
  const fusedScore = new Map(fused.map((f) => [`${toUiEntityType(f.row.entity_type)}:${f.row.entity_id}`, f]));

  const words = line.words.join(' ');
  const out = new Map<string, Scored>();
  for (const row of [...arms.brand_sku, ...arms.keyword_sku, ...arms.keyword_doc, ...arms.fuzzy_sku]) {
    const facts = factsOf(row);
    if (!facts) continue;
    const key = `${facts.kind}:${facts.entityId}`;
    if (out.has(key)) continue;
    const inArm = (arm: string) => arms[arm].some((r) => `${r.kind}:${Number(r.entity_id)}` === key);
    const titleHit = [...arms.keyword_sku, ...arms.keyword_doc].some(
      (r) => `${r.kind}:${Number(r.entity_id)}` === key && r.score >= 2,
    );
    const fusion = fusedScore.get(key);
    const branded = inArm('brand_sku') || brandMatches(facts.brand, brandHits);
    const keyword = inArm('keyword_sku') || inArm('keyword_doc');

    let tier: Scored['tier'];
    let confidence: number;
    let matchedOn: Scored['matchedOn'];
    if (branded) {
      tier = IDENTIFY_TIERS.brand;
      confidence = 0.8;
      matchedOn = { field: 'brand', token: brandHits[0]?.token ?? words };
    } else if (keyword) {
      tier = IDENTIFY_TIERS.keyword;
      confidence = 0.55 + (titleHit ? 0.1 : 0) + ((fusion?.arms ?? 1) > 1 ? 0.1 : 0);
      matchedOn = corrections.length > 0
        ? { field: 'fuzzy', token: words }
        : { field: titleHit ? 'title' : 'keyword', token: words };
      if (corrections.length > 0) confidence *= 0.9;
    } else {
      tier = IDENTIFY_TIERS.fuzzy;
      const sim = Math.max(0, ...arms.fuzzy_sku.filter((r) => `${r.kind}:${Number(r.entity_id)}` === key).map((r) => r.score));
      confidence = Math.min(0.6, sim * 0.6);
      matchedOn = { field: 'fuzzy', token: words };
    }
    out.set(key, {
      kind: facts.kind,
      entityId: facts.entityId,
      tier,
      contextLevel: 0,
      score: fusion?.score ?? 0,
      happenedAt: facts.happenedAt,
      facts,
      confidence: Math.round(confidence * 1000) / 1000,
      matchedOn,
    });
  }
  return [...out.values()];
}

function assembleLine(
  line: ClassifiedLine,
  exactRows: IdentifyRow[],
  textRows: IdentifyRow[],
  brandHits: BrandTokenMatch[],
  scope: IdentifyContextScope | null,
  limit: number,
): IdentifyLine {
  const exact = exactCandidates(line, exactRows);
  let scored = exact.length > 0 ? exact : freeTextCandidates(line, textRows, brandHits);

  // Filters from token classification: a KNOWN other brand / grade is excluded; unknown stays.
  if (exact.length === 0 && brandHits.length > 0) {
    scored = scored.filter((c) => !c.facts.brand || brandMatches(c.facts.brand, brandHits));
  }
  if (exact.length === 0 && line.conditions.length > 0) {
    scored = scored.filter((c) => !c.facts.condition || line.conditions.includes(c.facts.condition));
  }

  for (const c of scored) c.contextLevel = contextLevel(scope, c.facts);
  scored.sort(compareCandidates);

  const candidates = scored.slice(0, limit).map((c): IdentifyCandidate => ({
    kind: c.facts.kind,
    entityId: c.facts.entityId,
    title: c.facts.title,
    subtitle: c.facts.subtitle,
    brand: c.facts.brand,
    confidence: c.confidence,
    matchedOn: c.matchedOn,
    href: c.facts.href,
    actions: c.facts.actions,
    stage: c.facts.stage,
    inContext: c.contextLevel > 0,
  }));

  return {
    input: line.input,
    mode: exact.length === 1 ? 'single' : candidates.length > 0 ? 'list' : 'none',
    tokens: line.tokens,
    filters: {
      brands: brandHits.map((h) => ({ id: h.brandId, name: h.name, token: h.token })),
      conditions: line.conditions,
    },
    candidates,
  };
}

// ── Orchestration ───────────────────────────────────────────────────────────

/** Words run as free text in the FIRST round trip: word lines, not identifier shapes. */
function searchesFirst(line: ClassifiedLine): boolean {
  return !line.machineIdentifier && line.words.length > 0 && (line.tokens.length > 1 || !/\d/.test(line.input));
}

function freeTextLine(index: number, line: ClassifiedLine): FreeTextLine {
  return {
    line: index,
    words: line.words,
    variants: line.words.flatMap((word) => typoVariants(word).map((variant) => ({ word, variant }))),
    brandNgrams: aliasNgrams(brandTokens(line.words.join(' '))),
  };
}

/**
 * A line's brand alias hits off its `brand_alias` rows. Longest match wins:
 * a hit whose n-gram is a strict sub-phrase of another hit's is dropped
 * ("hero" under "guitar hero").
 */
function brandHitsOf(rows: IdentifyRow[]): BrandTokenMatch[] {
  const hits = new Map<string, BrandTokenMatch>();
  for (const r of rows) {
    if (r.arm !== 'brand_alias' || !r.probe) continue;
    const brandId = Number(r.entity_id);
    hits.set(`${brandId}:${r.probe}`, {
      token: r.probe,
      brandId,
      name: String(r.doc_title ?? ''),
      kind: r.doc_subtitle as BrandTokenMatch['kind'],
      parentBrandId: Number(r.arm_rank) > 0 ? Number(r.arm_rank) : null,
      aliasSource: String(r.value ?? ''),
    });
  }
  const all = [...hits.values()];
  return all
    .filter((h) => !all.some((o) => o.token !== h.token && ` ${o.token} `.includes(` ${h.token} `)))
    .sort((a, b) => a.token.localeCompare(b.token) || a.brandId - b.brandId);
}

async function resolveLines(
  orgId: OrgId,
  lines: ClassifiedLine[],
  scope: IdentifyContextScope | null,
  limit: number,
  deps: IdentifyDeps,
): Promise<IdentifyLine[]> {
  const first = lines.map((l, i) => i).filter((i) => searchesFirst(lines[i]));
  const firstStatement = buildIdentifyStatement({
    orgId,
    probes: lines.flatMap((l) => l.probes),
    freeText: first.map((i) => freeTextLine(i, lines[i])),
    brandSql: deps.brandSql,
  });
  const round1 = await deps.query(orgId, firstStatement.text, firstStatement.values);

  const exactRows = round1.rows.filter((r) => r.arm === 'exact');
  const textRows = new Map<number, IdentifyRow[]>();
  const addText = (rows: IdentifyRow[]) => {
    for (const r of rows) {
      if (r.line == null || r.arm === 'exact') continue;
      const list = textRows.get(Number(r.line)) ?? [];
      list.push(r);
      textRows.set(Number(r.line), list);
    }
  };
  addText(round1.rows);

  // Identifier-shaped lines that missed every exact probe (`PS48`) get the
  // free-text + brand arms in a second trip; nothing else ever needs one.
  const hasExact = (line: ClassifiedLine) =>
    line.probes.some((p) => p.kind === 'ticket') ||
    exactRows.some((r) => line.probes.some((p) => p.kind === r.probe && p.value === r.value));
  const fallback = lines
    .map((l, i) => i)
    .filter((i) => !first.includes(i) && !lines[i].machineIdentifier && lines[i].words.length > 0 && !hasExact(lines[i]));
  if (fallback.length > 0) {
    const statement = buildIdentifyStatement({
      orgId,
      probes: [],
      freeText: fallback.map((i) => freeTextLine(i, lines[i])),
      brandSql: deps.brandSql,
    });
    addText((await deps.query(orgId, statement.text, statement.values)).rows);
  }

  return lines.map((line, i) => {
    const rows = textRows.get(i) ?? [];
    return assembleLine(line, exactRows, rows, brandHitsOf(rows), scope, limit);
  });
}

/** The cache key: org-partitioned by the cache itself; the paste is hashed so keys stay short. */
function identifyCacheKey(lines: string[], context: string | null, limit: number): string {
  const digest = createHash('sha256').update(lines.join('\n')).digest('base64url');
  return createCacheLookupKey({ v: 1, q: digest, context: context ?? '', limit });
}

export async function identify(
  orgId: OrgId,
  request: IdentifyRequest,
  deps: IdentifyDeps = defaultIdentifyDeps,
): Promise<IdentifyResponse> {
  const { lines, truncated } = splitIdentifyBatch(request.q);
  const limit = request.limit ?? IDENTIFY_DEFAULT_LIMIT;
  const context = request.context ?? null;
  if (lines.length === 0) return { mode: 'none', lines: [], truncated, context };

  return deps.cache(orgId, identifyCacheKey(lines, context, limit), async () => {
    const resolved = await resolveLines(
      orgId,
      lines.map(classifyIdentifyLine),
      identifyContextScope(context),
      limit,
      deps,
    );
    return {
      mode: resolved.length > 1 ? 'batch' : resolved[0].mode,
      lines: resolved,
      truncated,
      context,
    };
  });
}

/** One `search_query_log` row per identified line (surface `identify`) — the server recents feed. */
export function recordIdentifyQueries(
  entry: { orgId: OrgId; staffId: number | null; response: IdentifyResponse; latencyMs: number },
): Promise<void> {
  return recordSearchQueries(
    entry.response.lines.map((line) => ({
      orgId: entry.orgId,
      staffId: entry.staffId,
      query: line.input,
      surface: 'identify' as const,
      resultCount: line.candidates.length,
      latencyMs: entry.latencyMs,
    })),
  );
}

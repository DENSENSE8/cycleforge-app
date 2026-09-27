/**
 * Brand route cores: validate → delegate → map status → audit. The route
 * files are one-line shells that gate with withAuth / requireRoutePerm and
 * hand the session context here; orgId and staffId only ever come from that
 * context. Deps are injectable so route behaviour is testable DB-free.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import type { AuthContext } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit, type RecordAuditArgs } from '@/lib/audit-logs';
import { getApiIdempotencyResponse, readIdempotencyKey, saveApiIdempotencyResponse } from '@/lib/api-idempotency';
import {
  reviewAgentMutation,
  type ReviewAgentMutationInput,
  type ReviewAgentMutationResult,
} from '@/lib/assistant/mutations/apply-agent-mutation';
import { AGENT_MUTATION_STATUSES } from '@/lib/surfaces/registry';
import { parseBody } from '@/lib/schemas/parse';
import { BrandCreateBody, BrandListQuery, BrandProductsQuery, BrandUpdateBody } from '@/lib/schemas/brands';
import { tenantQueryOneTrip, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { createBrand, updateBrand } from './brands';
import { normalizeBrandName } from './normalize';
import { BRAND_REVIEW_KINDS, sqlBrandStore, type BrandStore, type Queryable } from './store';

const ROUTE_BRANDS_POST = 'brands.post';
const AUDIT_SOURCE = 'brands-api';

export interface BrandHttpDeps {
  /** One-statement reads (one round trip). */
  read: <T>(orgId: OrgId, fn: (store: BrandStore) => Promise<T>) => Promise<T>;
  /** Writes, in one tenant transaction. */
  write: <T>(orgId: OrgId, fn: (store: BrandStore) => Promise<T>) => Promise<T>;
  audit: (ctx: AuthContext, req: NextRequest, args: RecordAuditArgs) => Promise<void>;
  idempotency: {
    get: (orgId: OrgId, key: string, route: string) => Promise<{ status_code: number; response_body: Record<string, unknown> } | null>;
    save: (params: { orgId: OrgId; idempotencyKey: string; route: string; staffId: number | null; statusCode: number; responseBody: Record<string, unknown> }) => Promise<void>;
  };
  review: (input: ReviewAgentMutationInput) => Promise<ReviewAgentMutationResult>;
}

export const defaultBrandHttpDeps: BrandHttpDeps = {
  read: (orgId, fn) => {
    const oneTrip: Queryable = {
      query: (sql, params) => tenantQueryOneTrip(orgId, sql, params ?? []) as never,
    };
    return fn(sqlBrandStore(oneTrip, orgId));
  },
  write: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(sqlBrandStore(client as unknown as Queryable, orgId))),
  audit: async (ctx, req, args) => {
    await recordAudit(pool, ctx, req, args);
  },
  idempotency: {
    get: (orgId, key, route) => getApiIdempotencyResponse(pool, orgId, key, route),
    save: (params) => saveApiIdempotencyResponse(pool, params),
  },
  review: (input) => reviewAgentMutation(input),
};

function fail(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

function queryIssues(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'INVALID_QUERY',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    },
    { status: 400 },
  );
}

/** GET /api/brands?q=&kind=&limit= — typeahead: alias hit first, then active SKU count. */
export async function handleBrandList(req: NextRequest, ctx: AuthContext, deps: BrandHttpDeps = defaultBrandHttpDeps) {
  const parsed = BrandListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return queryIssues(parsed.error);
  const { q, kind, limit } = parsed.data;
  const brands = await deps.read(ctx.organizationId, (s) =>
    s.listBrands({ q: normalizeBrandName(q), kind: kind ?? null, limit }),
  );
  return NextResponse.json({ success: true, brands });
}

/** POST /api/brands — create a brand with its aliases (collision = 409). */
export async function handleBrandCreate(req: NextRequest, ctx: AuthContext, deps: BrandHttpDeps = defaultBrandHttpDeps) {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(BrandCreateBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
  if (idemKey) {
    const hit = await deps.idempotency.get(ctx.organizationId, idemKey, ROUTE_BRANDS_POST);
    if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
  }

  const { idempotencyKey: _key, ...input } = parsed;
  const r = await deps.write(ctx.organizationId, (s) => createBrand(s, { ...input, aliasSource: 'operator' }));
  if (!r.ok) return fail(r.status, r.error, r.collisions ? { collisions: r.collisions } : undefined);

  await deps.audit(ctx, req, {
    source: AUDIT_SOURCE,
    action: AUDIT_ACTION.BRAND_CREATE,
    entityType: AUDIT_ENTITY.PRODUCT_BRAND,
    entityId: r.brand.id,
    after: { ...r.brand, aliases: r.aliases.map((a) => a.alias) },
  });

  const responseBody = { success: true, brand: r.brand, aliases: r.aliases };
  if (idemKey) {
    await deps.idempotency.save({
      orgId: ctx.organizationId,
      idempotencyKey: idemKey,
      route: ROUTE_BRANDS_POST,
      staffId: ctx.staffId,
      statusCode: 201,
      responseBody,
    });
  }
  return NextResponse.json(responseBody, { status: 201 });
}

/** GET /api/brands/[id] — detail: aliases, parent/children, SKU / open-order / on-hand roll-ups. */
export async function handleBrandGet(req: NextRequest, ctx: AuthContext, rawId: string, deps: BrandHttpDeps = defaultBrandHttpDeps) {
  const id = parseId(rawId);
  if (id == null) return fail(400, 'Invalid ID');
  const detail = await deps.read(ctx.organizationId, (s) => s.getBrandDetail(id));
  if (!detail) return fail(404, 'Not found');
  return NextResponse.json({ success: true, ...detail });
}

/** PATCH /api/brands/[id] — rename / re-parent / (de)activate, alias add + remove. */
export async function handleBrandUpdate(req: NextRequest, ctx: AuthContext, rawId: string, deps: BrandHttpDeps = defaultBrandHttpDeps) {
  const id = parseId(rawId);
  if (id == null) return fail(400, 'Invalid ID');
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(BrandUpdateBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const out = await deps.write(ctx.organizationId, async (s) => {
    const before = await s.getBrand(id);
    if (!before) return { before: null, aliasesBefore: [], result: null };
    const aliasesBefore = await s.listAliases(id);
    return { before, aliasesBefore, result: await updateBrand(s, id, { ...parsed, aliasSource: 'operator' }) };
  });
  if (!out.before || !out.result) return fail(404, 'Not found');
  const r = out.result;
  if (!r.ok) return fail(r.status, r.error, r.collisions ? { collisions: r.collisions } : undefined);

  if (r.changed) {
    const had = new Set(out.aliasesBefore.map((a) => a.normalizedAlias));
    const has = new Set(r.aliases.map((a) => a.normalizedAlias));
    await deps.audit(ctx, req, {
      source: AUDIT_SOURCE,
      action: AUDIT_ACTION.BRAND_UPDATE,
      entityType: AUDIT_ENTITY.PRODUCT_BRAND,
      entityId: id,
      before: { ...out.before },
      after: { ...r.brand },
      extra: {
        aliasesAdded: r.aliases.filter((a) => !had.has(a.normalizedAlias)).map((a) => a.alias),
        aliasesRemoved: out.aliasesBefore.filter((a) => !has.has(a.normalizedAlias)).map((a) => a.alias),
      },
    });
  }
  return NextResponse.json({ success: true, brand: r.brand, aliases: r.aliases, changed: r.changed });
}

interface ProductsCursor {
  sku: string;
  id: number;
}

function decodeCursor(raw: string): ProductsCursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (Array.isArray(v) && typeof v[0] === 'string' && Number.isInteger(v[1]) && v[1] > 0) return { sku: v[0], id: v[1] };
  } catch {
    // fall through — a malformed cursor is a 400, not a restart from page one
  }
  return null;
}

/** GET /api/brands/[id]/products?cursor=&limit=&status= — the brand's SKUs incl. descendant lines. Cursor = base64url([sku, id]). */
export async function handleBrandProducts(req: NextRequest, ctx: AuthContext, rawId: string, deps: BrandHttpDeps = defaultBrandHttpDeps) {
  const id = parseId(rawId);
  if (id == null) return fail(400, 'Invalid ID');
  const parsed = BrandProductsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return queryIssues(parsed.error);
  const { cursor, limit, status } = parsed.data;
  const after = cursor ? decodeCursor(cursor) : null;
  if (cursor && !after) return fail(400, 'Invalid cursor');

  const rows = await deps.read(ctx.organizationId, (s) => s.listBrandProducts(id, { status, limit: limit + 1, after }));
  if (rows.length === 0 && !after) {
    const exists = await deps.read(ctx.organizationId, (s) => s.getBrand(id));
    if (!exists) return fail(404, 'Not found');
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > limit && last ? Buffer.from(JSON.stringify([last.sku, last.skuCatalogId]), 'utf8').toString('base64url') : null;
  return NextResponse.json({ success: true, items, nextCursor });
}

const ProposalListQuery = z.object({
  status: z.enum(AGENT_MUTATION_STATUSES).optional().default('proposed'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  before: z.coerce.number().int().positive().optional(),
});

/** GET /api/brands/proposals?status=&limit=&before= — the approval-first brand review queue. */
export async function handleBrandProposalList(req: NextRequest, ctx: AuthContext, deps: BrandHttpDeps = defaultBrandHttpDeps) {
  const parsed = ProposalListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return queryIssues(parsed.error);
  const { status, limit, before } = parsed.data;
  const proposals = await deps.read(ctx.organizationId, (s) =>
    s.listProposals({ statuses: [status], limit, beforeId: before ?? null }),
  );
  const last = proposals[proposals.length - 1];
  return NextResponse.json({
    success: true,
    proposals,
    nextBefore: proposals.length === limit && last ? last.mutationId : null,
  });
}

const ProposalReviewBody = z
  .object({
    decision: z.enum(['approve', 'reject']),
    notes: z.string().trim().max(1000).optional(),
    /** Only for `sku_brand.assign`: the brand to set (required for a compatibility proposal). */
    brandId: z.number().int().positive().nullable().optional(),
  })
  .strict();

/** POST /api/brands/proposals/[id] — a human approves (applies) or rejects one proposal. */
export async function handleBrandProposalReview(
  req: NextRequest,
  ctx: AuthContext,
  rawId: string,
  deps: BrandHttpDeps = defaultBrandHttpDeps,
) {
  const id = parseId(rawId);
  if (id == null) return fail(400, 'Invalid ID');
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(ProposalReviewBody, raw);
  if (parsed instanceof NextResponse) return parsed;
  const overridesBrand = parsed.brandId !== undefined;
  const r = await deps.review({
    organizationId: ctx.organizationId,
    mutationId: id,
    decision: parsed.decision,
    actorStaffId: ctx.staffId,
    actorPermissions: ctx.permissions,
    notes: parsed.notes ?? null,
    payloadPatch: overridesBrand ? { brandId: parsed.brandId } : undefined,
    kinds: overridesBrand ? ['sku_brand.assign'] : BRAND_REVIEW_KINDS,
  });
  // reviewAgentMutation writes the audit row itself (agent_mutation.apply / .reject).
  if (!r.ok) return fail(r.status, r.error);
  return NextResponse.json({ success: true, mutationId: r.mutationId, status: r.status, targetRef: r.targetRef });
}

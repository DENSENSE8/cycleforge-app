/**
 * GET  /api/tool-forge/requests — this org's build requests, newest first.
 * POST /api/tool-forge/requests — submit a request for a new capability.
 *
 * The POST is where a staff ask becomes a row. It returns the triage outcome
 * inline, so a caller gets its denial (with the duplicate's id and path) in the
 * same round trip rather than having to poll for it — but the row exists from
 * the first write either way, which is what makes a pending state survive a
 * reload or a closed panel.
 *
 * The org is ctx.organizationId. There is no body field for it and no query
 * parameter for it; see src/lib/tool-forge/gateway-tools.ts for why the
 * documented `tenant_id` argument is accepted and ignored on the model-facing
 * side.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit } from '@/lib/audit-logs';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import pool from '@/lib/db';
import { submitBuildRequest } from '@/lib/tool-forge/requests';
import { BUILD_REQUEST_STATUSES } from '@/lib/tool-forge/constants';

export const runtime = 'nodejs';

const ListQuery = z.object({
  status: z.enum(BUILD_REQUEST_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const SubmitBody = z.object({
  targetScope: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const parsed = ListQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_QUERY', detail: parsed.error.message }, { status: 400 });
    }
    const { status, limit } = parsed.data;

    const { rows } = await tenantQuery(
      ctx.organizationId,
      `SELECT br.id, br.status, br.target_scope, br.prompt, br.exact_reason,
              br.duplicate_tool_id, br.similarity, br.external_ref,
              br.created_at, br.updated_at,
              tr.tool_key  AS duplicate_tool_key,
              tr.name      AS duplicate_tool_name,
              tr.source_path AS duplicate_tool_path
         FROM build_requests br
         LEFT JOIN tool_registry tr
                ON tr.id = br.duplicate_tool_id
               AND tr.organization_id = br.organization_id
        WHERE br.organization_id = $1
          AND ($2::text IS NULL OR br.status = $2)
        ORDER BY br.created_at DESC, br.id DESC
        LIMIT $3`,
      [ctx.organizationId, status ?? null, limit],
    );

    return NextResponse.json({ requests: rows });
  },
  { permission: 'tool_forge.request' },
);

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    // Every submit costs an embedding call, so it is rate limited per org the
    // same way the other LLM-bearing endpoints are.
    const rate = await checkRateLimitForOrg({
      headers: request.headers,
      routeKey: 'tool-forge-submit',
      limit: 20,
      windowMs: 60_000,
      organizationId: ctx.organizationId,
    });
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED' },
        { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }
    const parsed = SubmitBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY', detail: parsed.error.message }, { status: 400 });
    }

    const result = await submitBuildRequest(ctx.organizationId, {
      targetScope: parsed.data.targetScope,
      prompt: parsed.data.prompt,
      requestedByStaffId: ctx.staffId ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    });

    await recordAudit(pool, ctx, request, {
      source: 'tool-forge',
      // Neither constant carries a tool-forge member yet, and both fields are
      // typed `AuditAction | string` / `AuditEntity | string` for exactly this
      // case. Promoting them into the enums is a separate change once the
      // surface has settled — inventing members for a pipeline still being
      // built is how a vocabulary ends up with dead values.
      action: 'tool_forge.request_submitted',
      entityType: 'build_request',
      entityId: result.request.id,
      after: {
        targetScope: result.request.targetScope,
        status: result.request.status,
        reasonCode: result.decision.reasonCode,
        duplicateToolId: result.decision.duplicateToolId,
        similarity: result.decision.similarity,
      },
    });

    return NextResponse.json(
      {
        request: result.request,
        decision: result.decision,
        duplicateTool: result.duplicateTool,
        replayed: result.replayed,
      },
      // 201 for a new request; a denial is still a successfully recorded
      // request, so it is not a 4xx. 200 on replay — nothing was created.
      { status: result.replayed ? 200 : 201 },
    );
  },
  { permission: 'tool_forge.request' },
);

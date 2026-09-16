/**
 * POST /api/integrations/[provider]/sync — "Sync now" for the caller's org.
 *
 * Runs the connector's wired sync() (connection-driven ingestion). Replaces the
 * ad-hoc transfer-orders / backfill buttons with a per-connection action.
 * 400 when the provider has no sync capability; 403 without the provider's
 * manage permission.
 *
 * ## Two response shapes, one code path
 *
 * `Accept: application/x-ndjson` streams the run: every `phase` (with its
 * count) and every per-row `detail` the job emits goes out as one JSON line,
 * terminated by a `result` line carrying the same {@link SyncOutcome} the JSON
 * form returns. That stream is what makes an operator-driven import measurable
 * — "214 rows read → 51 tracking → 12 updated → 35 inserted" instead of a
 * spinner that stops (operator 2026-09-15).
 *
 * Anything else gets the single JSON object, byte-identical to before: the
 * Settings › Integrations "Sync now" button and the cron fan-out do not render
 * a ledger and must not pay for a stream.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { getConnector } from '@/lib/integrations/connectors/registry';
import { syncConnection } from '@/lib/integrations/connectors/orchestrator';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { syncPermissionForProvider } from '@/lib/integrations/sync-permission';
import { wouldExceedPlanCeiling, planLimitResponseBody } from '@/lib/billing/plan-ceilings';
import { createNdjsonStream, ndjsonResponseHeaders } from '@/lib/orders-sync/streaming';

/** Optional body — provider-specific manual-sync options. */
const BodySchema = z
  .object({
    manualSheetName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const POST = withAuth(async (req, ctx) => {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const provider = segments[segments.indexOf('integrations') + 1] as IntegrationProvider;

  const connector = getConnector(provider);
  if (!connector?.sync) {
    return NextResponse.json({ error: 'NO_SYNC', provider }, { status: 400 });
  }
  const perm = syncPermissionForProvider(provider);
  if (!ctx.permissions.has(perm)) {
    return NextResponse.json({ error: 'FORBIDDEN', permission: perm }, { status: 403 });
  }

  // Soft plan ceiling: button-driven "Sync now" is an order-ingestion entry, so
  // it checks maxMonthlyOrders before pulling more. Dormant until
  // PLAN_FEATURE_ENFORCED; dogfood org exempt; fail-open (see plan-ceilings.ts).
  // Webhook/cron ingestion paths are deliberately NOT gated (never block
  // mid-stream).
  if (await wouldExceedPlanCeiling(ctx.organizationId, 'maxMonthlyOrders')) {
    return NextResponse.json(planLimitResponseBody('maxMonthlyOrders'), { status: 403 });
  }

  // Body is optional (the settings "Sync now" button sends none); when present
  // it must validate.
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', detail: parsed.error.flatten() }, { status: 400 });
  }

  // Non-streaming caller (Settings "Sync now", cron): one JSON object, as before.
  if (!req.headers.get('accept')?.includes('application/x-ndjson')) {
    const outcome = await syncConnection(ctx.organizationId, provider, {
      manualSheetName: parsed.data.manualSheetName,
    });
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
  }

  // Streaming caller (the desk / `/m` run surfaces): every phase + per-row
  // detail goes out as it happens, then the same outcome as a `result` line.
  // The response is 200 even for a failed run — the failure rides the outcome,
  // and a stream cannot retroactively change its status code.
  const stream = createNdjsonStream();
  void (async () => {
    try {
      const outcome = await syncConnection(ctx.organizationId, provider, {
        manualSheetName: parsed.data.manualSheetName,
        onProgress: stream.emit,
      });
      stream.emit({ type: 'result', result: outcome as unknown as Record<string, unknown> });
    } catch (error: unknown) {
      stream.emit({
        type: 'error',
        error: error instanceof Error ? error.message : 'Internal Server Error',
      });
    } finally {
      stream.finish();
    }
  })();

  return new Response(stream.body, { headers: ndjsonResponseHeaders() });
});

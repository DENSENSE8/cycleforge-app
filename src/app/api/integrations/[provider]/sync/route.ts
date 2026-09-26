/**
 * POST /api/integrations/[provider]/sync — "Sync now" for the caller's org.
 * spinner that stops (operator 2026-09-15).
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getConnector } from '@/lib/integrations/connectors/registry';
import { syncConnection } from '@/lib/integrations/connectors/orchestrator';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { syncPermissionForProvider } from '@/lib/integrations/sync-permission';
import { wouldExceedPlanCeiling, planLimitResponseBody } from '@/lib/billing/plan-ceilings';
import { createNdjsonStream, ndjsonResponseHeaders } from '@/lib/orders-sync/streaming';

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

  // Soft plan ceiling:
  if (await wouldExceedPlanCeiling(ctx.organizationId, 'maxMonthlyOrders')) {
    return NextResponse.json(planLimitResponseBody('maxMonthlyOrders'), { status: 403 });
  }

  // Non-streaming caller (Settings "Sync now", cron): one JSON object, as before.
  if (!req.headers.get('accept')?.includes('application/x-ndjson')) {
    const outcome = await syncConnection(ctx.organizationId, provider);
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
  }

  // Streaming caller (the desk / `/m` run surfaces):
  const stream = createNdjsonStream();
  void (async () => {
    try {
      const outcome = await syncConnection(ctx.organizationId, provider, { onProgress: stream.emit });
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

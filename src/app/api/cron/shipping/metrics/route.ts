/** GET /api/cron/shipping/metrics */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { logger } from '@/lib/observability/logger';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import {
  collectShippingTrackingMetrics,
  detectMetricAlerts,
} from '@/lib/jobs/shipping-metrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  try {
    const locked = await withCronLock('shipping.metrics', () =>
      withCronRun('shipping.metrics', async () => {
        const metrics = await collectShippingTrackingMetrics();
        const alerts = detectMetricAlerts(metrics);
        return { metrics, alerts };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
    const { metrics, alerts } = locked.result!;

    logger.info({
      deliveredUnscanned: metrics.deliveredUnscanned,
      blockedTotal: metrics.blockedTotal,
      uspsBlocked: metrics.uspsBlocked,
      pendingStatus: metrics.pendingStatus,
      errorStuckTotal: metrics.errorStuckTotal,
      outForDelivery: metrics.outForDelivery,
      inTransit: metrics.inTransit,
      openReceivingExceptions: metrics.openReceivingExceptions,
      unmatchedTracking: metrics.unmatchedTracking,
      perCarrier: metrics.perCarrier,
    }, '[metrics.shipping.tracking]');

    for (const alert of alerts) {
      const line = '[alert.shipping.tracking]';
      if (alert.level === 'error') console.error(line, alert);
      else console.warn(line, alert);
    }

    return NextResponse.json({ ok: true, metrics, alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'metrics threw';
    console.error('[cron.shipping.metrics] fatal', { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST /api/print-station-device/pair — an enrolled print station exchanges its single-use code for a device token. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { printStationDevicePairBodySchema, type PrintStationDeviceState } from '@/lib/print/print-station-registry-contracts';
import { pairPrintStationDevice, setPrintStationCookie } from '@/lib/print/print-station-device';
import { checkRateLimitAsync } from '@/lib/api-guard';

export const runtime = 'nodejs';

// Named handler (not inline) so the route-auth auditor classifies this as
// `withAuth (anonymous OK)` — the pairing code is the capability.
async function handlePair(req: NextRequest) {
  const rate = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'print-station-pair',
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED' },
      { status: 429, headers: rate.retryAfterSec ? { 'retry-after': String(rate.retryAfterSec) } : undefined },
    );
  }
  const parsed = printStationDevicePairBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const pairing = await pairPrintStationDevice(parsed.data.code);
  // Expired, already used, unknown, or a kiosk code — never distinguish.
  if (!pairing) return NextResponse.json({ error: 'INVALID_PAIRING_CODE' }, { status: 404 });

  // Anonymous ctx — stamp the org from the paired row; no staff did this, the station paired itself.
  await recordAudit(pool, null, req, {
    source: 'print-station-device',
    action: AUDIT_ACTION.PRINT_STATION_PAIRED,
    entityType: AUDIT_ENTITY.PRINT_STATION,
    entityId: pairing.stationId,
    organizationIdOverride: pairing.organizationId,
    extra: { via: `kiosk_device:${pairing.deviceId}`, name: pairing.name },
  });

  const state: PrintStationDeviceState = {
    organizationId: pairing.organizationId,
    stationId: pairing.stationId,
    name: pairing.name,
    paused: pairing.paused,
  };
  const res = NextResponse.json(state);
  setPrintStationCookie(res, pairing.token);
  return res;
}

export const POST = withAuth(handlePair, { allowAnonymous: true });

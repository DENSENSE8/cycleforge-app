/**
 * Enrolled print station API wrapper — the device-principal sibling of
 * `withAuth` / `withKioskAuth`. The `cf_print_station` cookie must resolve to
 * an active `kind = 'print_station'` credential bound to a station that is not
 * revoked; anything else is 401 `PRINT_STATION_UNPAIRED` (the station page
 * shows Revoked / the code entry). No dev auto-bind: a station is always paired.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadPrintStationDevice,
  readPrintStationToken,
  type ResolvedPrintStationDevice,
} from '@/lib/print/print-station-device';
import type { OrgId } from '@/lib/tenancy/constants';

export interface PrintStationAuthContext {
  organizationId: OrgId;
  principal: 'print_station';
  /** `kiosk_devices.id` of the station's credential. */
  deviceId: number;
  /** `print_stations.station_id` — the id senders address it by. */
  stationId: string;
  /** The org's name for it. */
  name: string;
  paused: boolean;
}

type PrintStationHandler = (req: NextRequest, ctx: PrintStationAuthContext) => Promise<Response> | Response;
type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response> | Response;

export function withPrintStationAuth(
  handler: PrintStationHandler,
  loadDevice: (token: string | null) => Promise<ResolvedPrintStationDevice | null> = loadPrintStationDevice,
): RouteHandler {
  return async (req) => {
    const device = await loadDevice(readPrintStationToken(req));
    if (!device) return NextResponse.json({ error: 'PRINT_STATION_UNPAIRED' }, { status: 401 });
    const ctx: PrintStationAuthContext = {
      organizationId: device.organizationId as OrgId,
      principal: 'print_station',
      deviceId: device.deviceId,
      stationId: device.stationId,
      name: device.name,
      paused: device.paused,
    };
    // Error floor mirroring withAuth / withKioskAuth: an uncaught throw answers JSON, not Next's bodyless 500.
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`[withPrintStationAuth] ${req.method} ${req.nextUrl.pathname} threw:`, err);
      const payload: Record<string, unknown> = { error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) };
      if (process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack) payload.stack = err.stack;
      return NextResponse.json(payload, { status: 500 });
    }
  };
}

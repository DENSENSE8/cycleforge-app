import 'server-only';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { ShipStationApiError } from '@/lib/shipping/shipstation/client';
import { ShipFromNotConfiguredError, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';

/** One ShipStation-aware error face for the label-intake routes. */
export function labelIntakeErrorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof ShipStationNotConnectedError) {
    return NextResponse.json({ ok: false, code: 'SHIPSTATION_NOT_CONNECTED', error: error.message }, { status: 400 });
  }
  if (error instanceof ShipFromNotConfiguredError) {
    return NextResponse.json({ ok: false, code: 'SHIP_FROM_NOT_CONFIGURED', error: error.message }, { status: 400 });
  }
  if (error instanceof ShipStationApiError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.isNotConnected ? 400 : 502 });
  }
  return errorResponse(error, where);
}

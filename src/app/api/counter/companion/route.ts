/**
 * GET  /api/counter/companion?t=<token> — the joined phone reads the visit's units.
 * POST /api/counter/companion — the phone scans a serial into one unit.
 *
 * Callers: `/m/repair-scan` (`RepairScanCompanion`).
 * Affected API: this route (staff session, `walk_in.intake` — the same gate as
 *   editing a counter session line).
 * Data schemas: `kiosk_companion_links` via `readCompanionForPhone` /
 *   `queueSerialFromPhone`.
 * User: "join the same repair service session and then scan something like a
 *   serial number to input and update the form on your phone as well".
 *
 * The token is the capability for WHICH tablet; the staff session is the
 * capability to touch a visit at all, and it pins the org — a token from
 * another org's tablet is simply not found here.
 *
 * No audit row: a scan only fills a form field on the tablet. The visit the
 * serial lands on is audited when the tablet submits it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import {
  queueSerialFromPhone,
  readCompanionForPhone,
} from '@/lib/kiosk/companion-link.server';
import { CompanionSerialSchema } from '@/lib/kiosk/companion-shape';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;
const TokenSchema = z.string().min(16).max(128);
const ScanSchema = CompanionSerialSchema.extend({ token: TokenSchema });

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const token = TokenSchema.safeParse(req.nextUrl.searchParams.get('t'));
  if (!token.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }
  const link = await readCompanionForPhone(ctx.organizationId as OrgId, token.data);
  if (!link) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(link, { headers: NO_STORE });
}, { permission: 'walk_in.intake' });

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const parsed = ScanSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }
  const { token, ...serial } = parsed.data;
  const result = await queueSerialFromPhone(ctx.organizationId as OrgId, token, serial);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 409;
    return NextResponse.json({ error: result.reason.toUpperCase() }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ devices: result.devices }, { headers: NO_STORE });
}, { permission: 'walk_in.intake' });

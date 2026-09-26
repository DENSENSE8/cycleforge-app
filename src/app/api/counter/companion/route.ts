/** GET /api/counter/companion?t=<token> — the joined phone reads the visit's units. */

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

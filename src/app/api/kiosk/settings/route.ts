import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { getOrganization } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const org = await getOrganization(ctx.organizationId as OrgId);
  const settings = org?.settings;
  if (!settings) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  // `kiosk` is behaviour (idle timing), `brand` is identity — the shell reads
  // both and resolves idle timing through src/lib/kiosk/idle.ts.
  return NextResponse.json({
    brand: settings.brand ?? {},
    kiosk: settings.kiosk ?? {},
  });
});

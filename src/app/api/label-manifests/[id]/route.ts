import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getManifestDetailByRef } from '@/lib/labels/manifest';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** GET /api/label-manifests/[id] — manifest detail + its member units with line attribution (origin_receiving_line_id per unit). */
export const GET = withAuth(
  async (request, ctx) => {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean);
    const ref = decodeURIComponent(segments[segments.length - 1] ?? ''); // .../label-manifests/[id|uid]
    if (!ref) {
      return NextResponse.json({ ok: false, error: 'invalid manifest ref' }, { status: 400 });
    }
    const manifest = await getManifestDetailByRef(ref, ctx.organizationId as OrgId);
    if (!manifest) {
      return NextResponse.json({ ok: false, error: 'manifest not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, manifest });
  },
  { permission: 'print.label' },
);

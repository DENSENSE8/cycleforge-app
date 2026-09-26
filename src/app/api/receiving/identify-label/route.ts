/** POST /api/receiving/identify-label */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveModels } from '@/lib/receiving/label-identify';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
    }

    const models: string[] = Array.isArray(body.models)
      ? (body.models as unknown[]).map((m) => String(m ?? '')).filter(Boolean)
      : typeof body.model === 'string' && body.model.trim()
        ? [body.model.trim()]
        : [];

    if (models.length === 0) {
      return NextResponse.json(
        { success: false, error: 'model (string) or models (string[]) is required' },
        { status: 400 },
      );
    }

    // sku→sku_catalog is a STRING-key join that collides across tenants, so the
    // model→catalog resolution must be org-scoped (threaded into resolveModels).
    const candidates = await resolveModels(models, orgId);
    return NextResponse.json({ success: true, candidates });
  },
  { permission: 'receiving.view' },
);

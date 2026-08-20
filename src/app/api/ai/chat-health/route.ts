/**
 * AI Chat health probe — resolves THIS org's chat provider (vault BYOK →
 * platform default) and reports its live model list.
 *
 * Org-aware since the provider consolidation: two tenants on different
 * providers get different answers, and a probe that reported a platform env
 * endpoint would be telling most of them about a box they do not use.
 */
import { NextResponse } from 'next/server';
import { formatPSTTimestamp } from '@/utils/date';
import { withAuth } from '@/lib/auth/withAuth';
import { aiRequestHeaders } from '@/lib/ai/provider';
import { resolveOrgAiConfig } from '@/lib/ai/org-provider';

export const runtime = 'nodejs';

export const GET = withAuth(async (_req, ctx) => {
  const timestamp = formatPSTTimestamp();

  const config = await resolveOrgAiConfig(ctx.organizationId, 'chat');
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        backend: 'unconfigured',
        error: 'No AI chat provider is connected for this workspace.',
        timestamp,
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${config.baseURL}/models`, {
      headers: aiRequestHeaders(config),
      signal: AbortSignal.timeout(4_000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const models = data?.data ?? [];
      return NextResponse.json({
        ok: true,
        // `backend` now names WHICH provider answered, so an operator can tell
        // "my local model" from "the platform default" without reading env.
        backend: config.source,
        model: models[0]?.id ?? config.model,
        models: models.map((m: { id?: string }) => m.id),
        timestamp,
      });
    }

    return NextResponse.json(
      { ok: false, backend: config.source, error: `Provider returned ${res.status}`, timestamp },
      { status: 503 },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        backend: config.source,
        error: err?.message ?? 'AI provider unreachable',
        timestamp,
      },
      { status: 503 },
    );
  }
}, { permission: 'dashboard.view' });

/** /api/ai/usage — the tenant's AI usage + price breakdown (Settings → AI). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveOrgAiConfig } from '@/lib/ai/org-provider';
import { getAiUsageMarginPercent, summarizeAiUsage } from '@/lib/ai/usage';
import { applyMarginMicrocents } from '@/lib/ai/model-pricing';
import type { OrgId } from '@/lib/tenancy/constants';

function hostOf(baseURL: string): string {
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId as OrgId;
    const daysRaw = Number(req.nextUrl.searchParams.get('days'));
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 90) : 30;

    const [chat, embed, summary, marginPercent] = await Promise.all([
      resolveOrgAiConfig(orgId, 'chat'),
      resolveOrgAiConfig(orgId, 'embed'),
      summarizeAiUsage(orgId, days),
      getAiUsageMarginPercent(orgId),
    ]);

    const estimatedMicrocents = summary.reduce((sum, r) => sum + r.costMicrocents, 0);
    // Margin applies to platform-carried usage only — BYOK rows are billed by
    // the tenant's own provider, so they surface at cost with no markup.
    const platformMicrocents = summary
      .filter((r) => r.provider === 'platform')
      .reduce((sum, r) => sum + r.costMicrocents, 0);
    const billedMicrocents =
      applyMarginMicrocents(platformMicrocents, marginPercent) +
      (estimatedMicrocents - platformMicrocents);

    return NextResponse.json({
      days,
      providers: {
        chat: chat ? { source: chat.source, model: chat.model, host: hostOf(chat.baseURL) } : null,
        embed: embed ? { source: embed.source, model: embed.model, host: hostOf(embed.baseURL) } : null,
      },
      summary,
      marginPercent,
      totals: {
        calls: summary.reduce((sum, r) => sum + r.calls, 0),
        inputTokens: summary.reduce((sum, r) => sum + r.inputTokens, 0),
        outputTokens: summary.reduce((sum, r) => sum + r.outputTokens, 0),
        estimatedMicrocents,
        platformMicrocents,
        billedMicrocents,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/ai/usage:', error);
    return NextResponse.json({ error: 'Usage lookup failed' }, { status: 500 });
  }
}, { permission: 'admin.view' });

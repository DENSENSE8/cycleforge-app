import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { IdentificationAuthorBrief } from '@/lib/schemas/identification-grammar';
import { resolveOrgAiConfig } from '@/lib/ai/org-provider';
import { authorIdentificationGrammar } from '@/lib/identification/author';

/**
 * POST /api/identification/methods/author
 *
 * Studio-only. Returns compiled grammar JSON. Does not publish. Does not run
 * on /api/scan/resolve.
 */
export const POST = withAuth(async (request, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(IdentificationAuthorBrief, raw);
  if (parsed instanceof NextResponse) return parsed;

  const generateJson = async (system: string, user: string): Promise<unknown> => {
    const cfg = await resolveOrgAiConfig(ctx.organizationId, 'chat');
    if (!cfg) throw new Error('AI chat is not configured');
    const provider = createOpenAICompatible({
      name: 'cycle-forge-ai',
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      ...(cfg.headers ? { headers: cfg.headers } : {}),
    });
    const result = await generateText({
      model: provider.chatModel(cfg.model),
      system,
      prompt: user,
    });
    const stripped = result.text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(stripped) as unknown;
  };

  try {
    const out = await authorIdentificationGrammar(parsed.brief, generateJson);
    return NextResponse.json({
      ok: true,
      source: out.source,
      grammar: out.grammar,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'author failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}, { permission: 'admin.view' });

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { IdentificationGrammarBody } from '@/lib/schemas/identification-grammar';
import {
  IdentificationMethodsUnavailableError,
  listIdentificationMethods,
  saveIdentificationMethodDraft,
} from '@/lib/identification/methods-store';

/**
 * GET /api/identification/methods — org drafts + published (not gun classify).
 */
export const GET = withAuth(async (_request, ctx) => {
  const items = await listIdentificationMethods(ctx.organizationId);
  return NextResponse.json({ ok: true, items });
}, { permission: 'admin.view' });

/**
 * POST /api/identification/methods — save a compiled draft (unpublishes).
 */
export const POST = withAuth(async (request, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(IdentificationGrammarBody, raw);
  if (parsed instanceof NextResponse) return parsed;
  try {
    const item = await saveIdentificationMethodDraft(ctx.organizationId, parsed);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    if (err instanceof IdentificationMethodsUnavailableError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'save failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}, { permission: 'admin.view' });

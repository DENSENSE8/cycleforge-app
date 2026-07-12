import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
// Importing the workflow barrel wires the full node palette (side-effect
// registration of ./nodes/*), so listNodeMeta() inside getAiTemplateVocabulary
// returns the complete, registered set.
import '@/lib/workflow';
import { getAiTemplateVocabulary } from '@/lib/studio/ai-template-vocab';

/**
 * GET /api/studio/templates/ai-vocabulary
 *
 * The closed palette an AI intake assistant is constrained to when it drafts or
 * recommends a workflow template (Template Platform Phase 5): the registered
 * engine node types (listNodeMeta) and operator surfaces (SURFACE_KEYS). A model
 * is handed THIS as its only allowed vocabulary, so it cannot propose an
 * unregistered node/surface — new capabilities still require a platform PR.
 * (validateTemplatePackage re-enforces the same guard at import; this is the
 * generation-time half.)
 *
 * Read-only; studio.view. Nothing here activates or writes anything.
 */
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async () => {
    try {
      const vocabulary = getAiTemplateVocabulary();
      return NextResponse.json({ ok: true, vocabulary });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ai vocabulary failed';
      console.error('[GET /api/studio/templates/ai-vocabulary] error:', err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  },
  { permission: 'studio.view', feature: 'studio' },
);

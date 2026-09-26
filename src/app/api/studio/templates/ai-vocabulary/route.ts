import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
// Importing the workflow barrel wires the full node palette (side-effect
// registration of ./nodes/*), so listNodeMeta() inside getAiTemplateVocabulary
// returns the complete, registered set.
import '@/lib/workflow';
import { getAiTemplateVocabulary } from '@/lib/studio/ai-template-vocab';

/** GET /api/studio/templates/ai-vocabulary */
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

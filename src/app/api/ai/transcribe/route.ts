import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { MAX_TRANSCRIBE_BYTES, transcribeAudio } from '@/lib/ai/transcribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ai/transcribe — companion composer voice input (multipart `audio`).
 *
 * Speech → text through the org's provider chain (`src/lib/ai/transcribe.ts`).
 * 503 when no provider in the chain can transcribe; the phone then falls back
 * to the browser's SpeechRecognition. No audit row: nothing is mutated and the
 * transcript is a draft the operator still has to send.
 *
 * org comes from ctx — never the body.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'ai-transcribe',
    limit: Number(process.env.AI_TRANSCRIBE_RATE_LIMIT || 60),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart body required' }, { status: 400 });
  }
  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  }
  if (audio.size > MAX_TRANSCRIBE_BYTES) {
    return NextResponse.json({ error: 'audio too large' }, { status: 413 });
  }
  const languageRaw = form.get('language');
  const language = typeof languageRaw === 'string' && /^[a-z]{2}$/i.test(languageRaw) ? languageRaw : null;
  const filename = audio instanceof File && audio.name ? audio.name : 'dictation.webm';

  try {
    const result = await transcribeAudio(ctx.organizationId, audio, { filename, language });
    if (!result) {
      return NextResponse.json(
        { error: 'No speech provider configured for this organization.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, text: result.text, source: result.source });
  } catch (error: any) {
    console.error('Error in POST /api/ai/transcribe:', error);
    return NextResponse.json({ error: error?.message || 'Transcription failed' }, { status: 500 });
  }
}, { permission: 'assistant.chat' });

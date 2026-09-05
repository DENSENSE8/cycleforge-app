/**
 * Speech → text over the org's OWN provider chain.
 *
 * Companion composer voice input (PLAN-companion-composer). Walks
 * `resolveOrgAiChain(orgId, 'chat')` and tries every entry that speaks the
 * OpenAI audio wire (`POST {baseURL}/audio/transcriptions`): the org's OpenAI
 * key, the Vercel AI Gateway, then the platform default. Anthropic and a local
 * Ollama have no transcription endpoint and are skipped by source.
 *
 * Returns null when nothing in the chain can transcribe — the route answers 503
 * and the phone falls back to the browser's own SpeechRecognition.
 */

import { resolveOrgAiChain, type OrgAiConfig } from '@/lib/ai/org-provider';
import { aiRequestHeaders } from '@/lib/ai/provider';
import type { OrgId } from '@/lib/tenancy/constants';

/** Sources whose `baseURL` is an OpenAI-compatible root with `/audio/transcriptions`. */
const SPEECH_SOURCES: ReadonlySet<OrgAiConfig['source']> = new Set(['openai', 'ai_gateway', 'platform']);

const DEFAULT_STT_MODEL = 'whisper-1';
const GATEWAY_STT_MODEL = 'openai/whisper-1';

/** Hard cap per request; the phone records short bursts, not meetings. */
export const MAX_TRANSCRIBE_BYTES = 10 * 1024 * 1024;

export interface TranscribeDeps {
  resolveChain: (orgId: OrgId) => Promise<OrgAiConfig[]>;
  fetchImpl: typeof fetch;
}

const defaultDeps: TranscribeDeps = {
  resolveChain: (orgId) => resolveOrgAiChain(orgId, 'chat'),
  fetchImpl: (...args) => fetch(...args),
};

export interface TranscribeResult {
  text: string;
  source: OrgAiConfig['source'];
}

export function sttModelFor(config: OrgAiConfig): string {
  return config.source === 'ai_gateway' ? GATEWAY_STT_MODEL : DEFAULT_STT_MODEL;
}

export function canTranscribe(config: OrgAiConfig): boolean {
  return SPEECH_SOURCES.has(config.source) && !!config.baseURL;
}

export async function transcribeAudio(
  orgId: OrgId,
  audio: Blob,
  opts: { filename: string; language?: string | null },
  deps: TranscribeDeps = defaultDeps,
): Promise<TranscribeResult | null> {
  if (audio.size === 0 || audio.size > MAX_TRANSCRIBE_BYTES) return null;
  const chain = (await deps.resolveChain(orgId)).filter(canTranscribe);

  for (const config of chain) {
    try {
      const form = new FormData();
      form.append('file', audio, opts.filename);
      form.append('model', sttModelFor(config));
      form.append('response_format', 'json');
      if (opts.language) form.append('language', opts.language);

      const headers: Record<string, string> = { ...aiRequestHeaders(config) };
      // multipart boundary is set by fetch — never pin content-type here.
      delete headers['Content-Type'];
      delete headers['content-type'];

      const res = await deps.fetchImpl(`${config.baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: form,
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as { text?: unknown } | null;
      const text = typeof json?.text === 'string' ? json.text.trim() : '';
      if (!text) continue;
      return { text, source: config.source };
    } catch {
      // Try the next provider; the chain exists so one dead endpoint is not a dead feature.
    }
  }
  return null;
}

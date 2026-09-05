import test from 'node:test';
import assert from 'node:assert/strict';
import { canTranscribe, sttModelFor, transcribeAudio, type TranscribeDeps } from './transcribe';
import type { OrgAiConfig } from './org-provider';

const ORG = '00000000-0000-0000-0000-000000000001';

const cfg = (source: OrgAiConfig['source'], baseURL = 'https://example.test/v1'): OrgAiConfig => ({
  source,
  baseURL,
  apiKey: 'k',
  model: 'm',
});

function fakes(chain: OrgAiConfig[], responder: (url: string) => Response) {
  const calls: string[] = [];
  const deps: TranscribeDeps = {
    resolveChain: async () => chain,
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      return responder(url);
    },
  };
  return { deps, calls };
}

test('anthropic and local sources are skipped — no audio endpoint', () => {
  assert.equal(canTranscribe(cfg('anthropic')), false);
  assert.equal(canTranscribe(cfg('ollama' as OrgAiConfig['source'])), false);
  assert.equal(canTranscribe(cfg('openai')), true);
  assert.equal(canTranscribe(cfg('platform', '')), false);
});

test('gateway gets the namespaced whisper model', () => {
  assert.equal(sttModelFor(cfg('ai_gateway')), 'openai/whisper-1');
  assert.equal(sttModelFor(cfg('openai')), 'whisper-1');
});

test('first speech-capable provider that answers wins', async () => {
  const { deps, calls } = fakes(
    [cfg('anthropic', 'https://a.test/v1'), cfg('openai', 'https://o.test/v1'), cfg('platform', 'https://p.test/v1')],
    (url) =>
      url.startsWith('https://o.test')
        ? new Response(JSON.stringify({ text: '  ship order 42  ' }), { status: 200 })
        : new Response('nope', { status: 500 }),
  );
  const out = await transcribeAudio(ORG, new Blob(['x']), { filename: 'd.webm' }, deps);
  assert.deepEqual(out, { text: 'ship order 42', source: 'openai' });
  assert.deepEqual(calls, ['https://o.test/v1/audio/transcriptions']);
});

test('a failing provider falls through to the next; nothing left → null', async () => {
  const { deps, calls } = fakes(
    [cfg('openai', 'https://o.test/v1'), cfg('platform', 'https://p.test/v1')],
    () => new Response('down', { status: 503 }),
  );
  const out = await transcribeAudio(ORG, new Blob(['x']), { filename: 'd.webm' }, deps);
  assert.equal(out, null);
  assert.equal(calls.length, 2);
});

test('empty or oversized audio never hits the network', async () => {
  const { deps, calls } = fakes([cfg('openai')], () => new Response('{}', { status: 200 }));
  assert.equal(await transcribeAudio(ORG, new Blob([]), { filename: 'd.webm' }, deps), null);
  assert.equal(calls.length, 0);
});

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { postToAiProvider } from '@/lib/ai/failover';
import { isProviderDemotedShared, __resetProviderHealth } from '@/lib/ai/provider-health';
import { isProviderReachableCached, resetProviderReachabilityCache } from '@/lib/ai/provider-reachability';
import type { OrgAiDeps } from '@/lib/ai/org-provider';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-00000000c4a0' as OrgId;
let mode: 'ok' | '429' | '402' | 'hang' = 'ok';
const hits = { models: 0, chat: 0 };

async function listen(handler: http.RequestListener): Promise<{ url: string; server: http.Server }> {
  const server = http.createServer(handler);
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, '127.0.0.1', () => resolve());
  await promise;
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, server };
}

const bad = await listen((req, res) => {
  if (req.url?.endsWith('/models')) hits.models++;
  else hits.chat++;
  if (mode === 'hang') return; // never answer
  if (mode === 'ok') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[]}');
    return;
  }
  res.writeHead(Number(mode)).end(`{"error":"${mode}"}`);
});
const good = await listen((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' }).end('{"choices":[{"message":{"content":"ok"}}]}');
});

function depsFor(firstSource: 'openai' | 'ollama'): OrgAiDeps {
  return {
    getIntegrationCredentials: async <T,>(_o: OrgId, p: string) =>
      (p === firstSource
        ? firstSource === 'ollama'
          ? { baseUrl: bad.url, model: 'stub' }
          : { apiKey: 'sk-stub' }
        : null) as T | null,
    isAiConfigured: () => true,
    resolveAiConfig: () => ({ baseURL: good.url, apiKey: 'k', model: 'stub-good' }),
    resolveOrder: async () => 'cloud-first',
    isDemoted: (o, s, c) => isProviderDemotedShared(o, s, c),
    resolvePlatformAnthropicKey: () => '',
  };
}
// Route the fixed OpenAI base URL to the misbehaving stub; everything else is real HTTP.
const rewrite: typeof fetch = (input, init) =>
  fetch(String(input).replace('https://api.openai.com/v1', bad.url), init);

async function drill(label: string, m: typeof mode, first: 'openai' | 'ollama') {
  mode = m;
  __resetProviderHealth();
  const t0 = performance.now();
  const out = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, depsFor(first), rewrite);
  const ms = Math.round(performance.now() - t0);
  console.log(
    `${label}: served=${out.served.source} status=${out.res.status} demoted=[${out.demoted.map((d) => d.source)}] failover_ms=${ms}`,
  );
  const t1 = performance.now();
  const again = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, depsFor(first), rewrite);
  console.log(
    `${label} (next call, demotion active): served=${again.served.source} demoted=[${again.demoted.map((d) => d.source)}] ms=${Math.round(performance.now() - t1)}`,
  );
}

await drill('429 openai-slot', '429', 'openai');
await drill('402 openai-slot', '402', 'openai');
await drill('hang openai-slot (cloud budget)', 'hang', 'openai');
await drill('hang ollama-slot (local budget)', 'hang', 'ollama');

mode = 'ok';
hits.models = 0;
resetProviderReachabilityCache();
const cfg = { baseURL: bad.url, apiKey: '', model: 'stub' };
const t2 = performance.now();
const answers = await Promise.all(Array.from({ length: 20 }, () => isProviderReachableCached(cfg)));
console.log(
  `reachability: 20 concurrent calls → all=${answers.every(Boolean)} /models hits=${hits.models} ms=${Math.round(performance.now() - t2)}`,
);

bad.server.closeAllConnections();
bad.server.close();
good.server.close();

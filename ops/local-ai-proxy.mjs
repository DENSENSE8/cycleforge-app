#!/usr/bin/env node

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const host = '127.0.0.1';
const port = 8002;
const upstream = 'http://172.17.0.1:11434';
const model = 'qwen3:4b-nothink';
const apiKey = String(process.env.CYCLEFORGE_LOCAL_AI_API_KEY ?? '').trim();

if (apiKey.length < 48) throw new Error('CYCLEFORGE_LOCAL_AI_API_KEY is missing or too short');

function authorized(request) {
  const supplied = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const expectedBytes = Buffer.from(apiKey);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    if (!authorized(request)) return sendJson(response, 401, { error: 'unauthorized' });

    if (request.method === 'GET' && request.url === '/v1/models') {
      return sendJson(response, 200, {
        object: 'list',
        data: [{ id: model, object: 'model', owned_by: 'cycleforge-local' }],
      });
    }

    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      return sendJson(response, 404, { error: 'not found' });
    }

    const body = await readBody(request);
    if (body.stream === true) return sendJson(response, 400, { error: 'streaming is disabled' });
    body.model = model;
    body.stream = false;
    const nativeFormat = body.response_format?.json_schema?.schema
      ?? (body.response_format?.type === 'json_object' ? 'json' : undefined);
    const nativeBody = {
      model,
      stream: false,
      think: false,
      messages: body.messages,
      ...(nativeFormat ? { format: nativeFormat } : {}),
      options: {
        temperature: Number(body.temperature ?? 0),
        num_predict: Number(body.max_tokens ?? 2048),
      },
    };

    // Cloudflare closes an origin request that produces no bytes for ~100s.
    // A cold local model can legitimately take longer, so begin a JSON-safe
    // whitespace heartbeat before that edge deadline. The caller still sees
    // one ordinary JSON response after leading whitespace.
    let heartbeatStarted = false;
    let heartbeatInterval;
    const heartbeatTimer = setTimeout(() => {
      heartbeatStarted = true;
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      });
      response.write(' ');
      heartbeatInterval = setInterval(() => response.write(' '), 15_000);
    }, 45_000);

    let upstreamResponse;
    let result;
    try {
      upstreamResponse = await fetch(`${upstream}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nativeBody),
        signal: AbortSignal.timeout(180_000),
      });
      const nativeResult = await upstreamResponse.json();
      result = Buffer.from(JSON.stringify(upstreamResponse.ok ? {
        id: `chatcmpl-local-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: nativeResult.message?.content ?? '' },
          finish_reason: nativeResult.done_reason === 'length' ? 'length' : 'stop',
        }],
        usage: {
          prompt_tokens: nativeResult.prompt_eval_count ?? 0,
          completion_tokens: nativeResult.eval_count ?? 0,
          total_tokens: (nativeResult.prompt_eval_count ?? 0) + (nativeResult.eval_count ?? 0),
        },
      } : nativeResult));
    } finally {
      clearTimeout(heartbeatTimer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }
    if (!heartbeatStarted) {
      response.writeHead(upstreamResponse.status, {
        'content-type': upstreamResponse.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      });
    }
    response.end(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'local AI proxy failed';
    if (response.headersSent) {
      response.end(JSON.stringify({ error: message }));
      return;
    }
    sendJson(response, message === 'request body is too large' ? 413 : 502, { error: message });
  }
});

server.requestTimeout = 190_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => {
  process.stdout.write(`CycleForge structured AI proxy listening on http://${host}:${port}\n`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readImageWithUnlimitedOcr,
  resolveUnlimitedOcrConfig,
  UNLIMITED_OCR_DEFAULT_MODEL,
  type UnlimitedOcrDeps,
} from './unlimited-ocr-client';

test('Unlimited OCR config is explicit and includes Cloudflare Access service headers', () => {
  assert.equal(resolveUnlimitedOcrConfig({} as NodeJS.ProcessEnv), null);
  assert.deepEqual(
    resolveUnlimitedOcrConfig({
      UNLIMITED_OCR_BASE_URL: 'https://ocr.example/v1/',
      UNLIMITED_OCR_CF_ACCESS_CLIENT_ID: 'client-id',
      UNLIMITED_OCR_CF_ACCESS_CLIENT_SECRET: 'client-secret',
    } as NodeJS.ProcessEnv),
    {
      baseUrl: 'https://ocr.example/v1',
      model: UNLIMITED_OCR_DEFAULT_MODEL,
      apiKey: '',
      headers: {
        'CF-Access-Client-Id': 'client-id',
        'CF-Access-Client-Secret': 'client-secret',
      },
    },
  );
});

test('Unlimited OCR sends the image only to the named private model', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const deps: UnlimitedOcrDeps = {
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        model: 'unlimited-ocr:latest',
        choices: [{ message: { content: 'Order LCPU-123\nTotal $240.00' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  };

  const result = await readImageWithUnlimitedOcr(
    Buffer.from('image-bytes'),
    'image/jpeg',
    {
      baseUrl: 'https://ocr.example/v1',
      model: 'unlimited-ocr:latest',
      apiKey: 'private-key',
      headers: { 'CF-Access-Client-Id': 'cf-id' },
    },
    deps,
  );

  assert.deepEqual(result, {
    model: 'unlimited-ocr:latest',
    text: 'Order LCPU-123\nTotal $240.00',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ocr.example/v1/chat/completions');
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer private-key');
  assert.equal((calls[0].init.headers as Record<string, string>)['CF-Access-Client-Id'], 'cf-id');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, 'unlimited-ocr:latest');
  assert.equal(body.messages[0].content[0].text, '<image>document parsing.');
  assert.deepEqual(body.vllm_xargs, { ngram_size: 35, window_size: 128 });
  assert.equal(body.skip_special_tokens, false);
  assert.match(body.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
});

test('Unlimited OCR fails loudly on empty output', async () => {
  const deps: UnlimitedOcrDeps = {
    fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch,
  };

  await assert.rejects(
    readImageWithUnlimitedOcr(
      Buffer.from('image'),
      'image/png',
      { baseUrl: 'https://ocr.example/v1', model: 'unlimited-ocr:latest', apiKey: '' },
      deps,
    ),
    /empty transcription/i,
  );
});

test('Unlimited OCR rejects truncated or pathologically repetitive output', async () => {
  const repeated = Array.from({ length: 5 }, () => (
    'Name Address Telephone Street City Country Postal Mail Order Price Quantity Payment Notes'
  )).join(' ');
  const deps: UnlimitedOcrDeps = {
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: repeated } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
  };

  await assert.rejects(
    readImageWithUnlimitedOcr(
      Buffer.from('image'),
      'image/png',
      { baseUrl: 'https://ocr.example/v1', model: 'unlimited-ocr:latest', apiKey: '' },
      deps,
    ),
    /incomplete or repetitive/i,
  );
});

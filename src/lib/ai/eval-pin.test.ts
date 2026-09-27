/** The ai:eval pin decides which endpoint a dev chat turn hits — a loose parse here is an SSRF knob. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readEvalPin } from './eval-pin';

const DEV = { NODE_ENV: 'development' };
const pin = (headers: Record<string, string>, env: Record<string, string | undefined> = DEV) =>
  readEvalPin((name) => headers[name] ?? null, env);

test('local pin carries a loopback /v1 base URL and a model id', () => {
  assert.deepEqual(
    pin({ 'x-ai-eval-provider': 'local', 'x-ai-eval-base-url': 'http://127.0.0.1:18090/v1', 'x-ai-eval-model': 'cf-v2' }),
    { provider: 'local', model: 'cf-v2', baseURL: 'http://127.0.0.1:18090/v1' },
  );
  assert.deepEqual(pin({ 'x-ai-eval-provider': 'local', 'x-ai-eval-base-url': 'http://localhost:8080/v1' })?.baseURL, 'http://localhost:8080/v1');
  assert.deepEqual(
    pin({ 'x-ai-eval-provider': 'gateway', 'x-ai-eval-model': 'workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct' })?.model,
    'workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
  );
});

test('never pins in production, and never without the provider pin', () => {
  const headers = { 'x-ai-eval-provider': 'local', 'x-ai-eval-base-url': 'http://127.0.0.1:18090/v1' };
  assert.equal(pin(headers, { NODE_ENV: 'production' }), null);
  assert.equal(pin({ 'x-ai-eval-base-url': 'http://127.0.0.1:18090/v1' }), null);
  assert.equal(pin({ 'x-ai-eval-provider': 'other', 'x-ai-eval-base-url': 'http://127.0.0.1:18090/v1' }), null);
});

test('rejects any base URL that is not http://127.0.0.1|localhost:<port>/v1', () => {
  for (const url of [
    'http://10.0.0.5:8000/v1',
    'http://gex45:8000/v1',
    'https://127.0.0.1:8000/v1',
    'http://127.0.0.1/v1',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8000/v1/',
    'http://127.0.0.1:8000/v2',
    'http://127.0.0.1:8000/v1?x=1',
    'http://127.0.0.1:8000/v1#frag',
    'http://user:pw@127.0.0.1:8000/v1',
    'http://127.0.0.1.evil.com:8000/v1',
    'http://localhost.evil.com:8000/v1',
    'http://[::1]:8000/v1',
    'http://127.0.0.1:99999/v1',
    'http://127.0.0.1:0/v1',
    'file:///etc/passwd',
  ]) {
    assert.equal(pin({ 'x-ai-eval-provider': 'local', 'x-ai-eval-base-url': url }), null, url);
  }
});

test('a base URL on a gateway pin drops the pin instead of half-applying it', () => {
  assert.equal(pin({ 'x-ai-eval-provider': 'gateway', 'x-ai-eval-base-url': 'http://127.0.0.1:18090/v1' }), null);
});

test('rejects a model id that is not a short token', () => {
  for (const model of ['a'.repeat(121), 'cf v2', 'cf-v2\nx', '../etc', '-leading', 'm;rm']) {
    assert.equal(pin({ 'x-ai-eval-provider': 'local', 'x-ai-eval-model': model }), null, model);
  }
});

/**
 * Which provider errors send hermesToolCall to its JSON-mode retry: only a
 * runtime refusing the `tools` request itself. Any other failure must surface,
 * not be retried into a second, differently-shaped request.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/ai/hermes-tool-call.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isToolCallUnsupported } from './hermes-tool-call';

test('vLLM without a tool-call parser falls back to JSON mode (required and auto)', () => {
  // Verbatim bodies from the org's local vLLM (Qwen3-4B), 2026-09-28.
  assert.equal(
    isToolCallUnsupported(
      400,
      '{"error":{"message":"tool_choice=\\"required\\" requires --tool-call-parser to be set","type":"BadRequestError","param":null,"code":400}}',
    ),
    true,
  );
  assert.equal(
    isToolCallUnsupported(
      400,
      '{"error":{"message":"\\"auto\\" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set","type":"BadRequestError","param":null,"code":400}}',
    ),
    true,
  );
});

test('other failures surface instead of retrying', () => {
  assert.equal(
    isToolCallUnsupported(
      400,
      '{"error":{"message":"This model\'s maximum context length is 16384 tokens","type":"BadRequestError","code":400}}',
    ),
    false,
  );
  // Same words on a server error: the request shape was not what failed.
  assert.equal(isToolCallUnsupported(500, 'tool_choice=required requires --tool-call-parser to be set'), false);
});

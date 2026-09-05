/**
 * DB-free tests for the Zod → OpenAI-wire schema helper (Ask plan §17, PR 0).
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ASSISTANT_TOOLS } from './index';
import { buildWriteTools } from './write-tools';
import { UI_TOOLS } from '../agent-loop';
import {
  toFunctionParameters,
  toOpenAiFunctionTool,
  toResponsesFunctionTool,
  wireBytes,
  type WireToolSource,
} from './openai-schema';

/** Research D2: no single tool's parameters may exceed this on the wire. */
const MAX_PARAMETERS_BYTES = 1500;

function everyAdvertisedTool(): WireToolSource[] {
  return [...ASSISTANT_TOOLS.values(), ...buildWriteTools('probe-session'), ...UI_TOOLS];
}

test('every registry, write and UI tool converts to both envelopes without throwing', (t) => {
  const sources = everyAdvertisedTool();
  assert.ok(sources.length > 30, `expected the full registry, saw ${sources.length}`);
  let largest = { name: '', bytes: 0 };
  for (const source of sources) {
    const chat = toOpenAiFunctionTool(source);
    const responses = toResponsesFunctionTool(source);

    assert.equal(chat.type, 'function');
    assert.equal(chat.function.name, source.name);
    assert.equal(chat.function.description, source.description);
    assert.equal(chat.function.parameters.type, 'object', `${source.name} parameters.type`);
    assert.ok(!('$schema' in chat.function.parameters), `${source.name} leaks $schema`);
    assert.ok(!('strict' in chat.function), `${source.name} sets strict on chat envelope`);
    assert.ok(!('strict' in chat), `${source.name} sets strict on chat tool`);

    assert.equal(responses.type, 'function');
    assert.equal(responses.name, source.name);
    assert.ok(!('function' in responses), `${source.name} nests function in Responses envelope`);
    assert.ok(!('strict' in responses), `${source.name} sets strict on Responses envelope`);
    assert.deepEqual(responses.parameters, chat.function.parameters, 'one body, two envelopes');

    const bytes = wireBytes([chat.function.parameters]) - 2; // minus the array brackets
    assert.ok(bytes <= MAX_PARAMETERS_BYTES, `${source.name} parameters are ${bytes} bytes`);
    if (bytes > largest.bytes) largest = { name: source.name, bytes };
  }
  t.diagnostic(`largest parameters: ${largest.name} at ${largest.bytes} bytes`);
  t.diagnostic(`full advertised list (chat envelope): ${wireBytes(sources.map(toOpenAiFunctionTool))} bytes across ${sources.length} tools`);
});

test('Zod tools keep additionalProperties:false and lose the $schema URI', () => {
  for (const [, tool] of ASSISTANT_TOOLS) {
    const params = toFunctionParameters(tool);
    assert.equal(params.additionalProperties, false, `${tool.name} additionalProperties`);
    assert.equal(params.$schema, undefined);
  }
});

test('get_order_lookup: refine is dropped (both keys optional, no required), shape is the chat envelope', () => {
  const tool = ASSISTANT_TOOLS.get('get_order_lookup');
  assert.ok(tool, 'get_order_lookup is registered');
  const chat = toOpenAiFunctionTool(tool);
  assert.deepEqual(chat, {
    type: 'function',
    function: {
      name: 'get_order_lookup',
      description: tool.description,
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', minLength: 1, maxLength: 120 },
          trackingNumber: { type: 'string', minLength: 1, maxLength: 120 },
        },
        additionalProperties: false,
      },
    },
  });
  assert.ok(!('required' in chat.function.parameters), 'the .refine() rule is not representable');
});

test('Responses envelope is flat: name/description/parameters beside type', () => {
  const tool = ASSISTANT_TOOLS.get('get_receiving_by_tracking');
  assert.ok(tool);
  const responses = toResponsesFunctionTool(tool);
  assert.deepEqual(Object.keys(responses).sort(), ['description', 'name', 'parameters', 'type']);
  assert.equal(responses.parameters.type, 'object');
});

test('UI tools pass their hand-written input_schema through untouched, without mutating it', () => {
  const navigate = UI_TOOLS.find((t) => t.name === 'navigate');
  assert.ok(navigate);
  const before = JSON.stringify(navigate.input_schema);
  const chat = toOpenAiFunctionTool(navigate);
  assert.deepEqual(chat.function.parameters.required, ['path']);
  assert.equal(
    (chat.function.parameters.properties as Record<string, { type: string }>).path.type,
    'string',
  );
  assert.equal(JSON.stringify(navigate.input_schema), before, 'source schema is not mutated');
});

test('a $schema on a hand-written schema is stripped too, and type is always object', () => {
  const params = toFunctionParameters({
    name: 'x',
    description: 'y',
    input_schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', properties: {} },
  });
  assert.deepEqual(params, { properties: {}, type: 'object' });
  const zodParams = toFunctionParameters({
    name: 'z',
    description: 'w',
    inputSchema: z.object({ a: z.number().int().optional() }),
  });
  assert.equal(zodParams.type, 'object');
  assert.equal(zodParams.$schema, undefined);
});

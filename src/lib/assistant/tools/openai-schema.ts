/**
 * Zod → OpenAI-wire function tools (Ask plan §17; research D2).
 *
 * The read registry keeps Zod schemas (types.ts) and the Anthropic loop derives
 * `input_schema` from them with `z.toJSONSchema`. SuperGrok speaks the OpenAI
 * wire, where the same JSON-Schema body rides in one of two envelopes:
 *
 *   • Chat Completions  { type:'function', function:{ name, description, parameters } }
 *   • Responses         { type:'function', name, description, parameters }
 *
 * `parameters` is `z.toJSONSchema(inputSchema)` with three adjustments:
 *   – `$schema` stripped: the draft URI is noise on the wire and some relays
 *     reject keys they do not know inside `parameters`;
 *   – `type:'object'` forced, the same pin tool-server.test.ts holds for MCP;
 *   – `additionalProperties:false` kept exactly as Zod emits it.
 * No `strict` on either envelope: the proxy's strict-mode support is unknown,
 * and OpenAI strict mode rejects optional keys that are not `null` unions —
 * most registry tools have optional keys.
 *
 * `.refine()` is dropped silently by z.toJSONSchema (get_order_lookup
 * advertises orderId / trackingNumber both optional with no `required`). The
 * description carries the rule; `safeParse` in the dispatch enforces it.
 *
 * UI tools (agent-loop UI_TOOLS) arrive with a hand-written JSON `input_schema`
 * and go through the same two envelopes untouched, so one advertised list can
 * mix registry tools and client tools.
 */

import { z } from 'zod';

/** A registry / write tool: Zod input schema. */
export interface ZodToolSource {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
}

/** A client (UI) tool: hand-written JSON Schema, Anthropic `input_schema` key. */
export interface JsonSchemaToolSource {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type WireToolSource = ZodToolSource | JsonSchemaToolSource;

export interface OpenAiFunctionTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ResponsesFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function isZodSource(source: WireToolSource): source is ZodToolSource {
  return 'inputSchema' in source && source.inputSchema !== undefined;
}

/**
 * The JSON-Schema body both envelopes share. Pure: never mutates a UI tool's
 * hand-written schema (spread copy) and never caches — the registry is small.
 */
export function toFunctionParameters(source: WireToolSource): Record<string, unknown> {
  const raw: Record<string, unknown> = isZodSource(source)
    ? (z.toJSONSchema(source.inputSchema) as Record<string, unknown>)
    : { ...source.input_schema };
  const { $schema: _dropped, ...rest } = raw;
  return { ...rest, type: 'object' };
}

/** Chat Completions envelope (`POST /chat/completions`, `tools[]`). */
export function toOpenAiFunctionTool(source: WireToolSource): OpenAiFunctionTool {
  return {
    type: 'function',
    function: {
      name: source.name,
      description: source.description,
      parameters: toFunctionParameters(source),
    },
  };
}

/** Responses envelope (`POST /responses`, `tools[]`). */
export function toResponsesFunctionTool(source: WireToolSource): ResponsesFunctionTool {
  return {
    type: 'function',
    name: source.name,
    description: source.description,
    parameters: toFunctionParameters(source),
  };
}

/** Bytes an advertised list costs on the wire — what §18's subsetting budgets. */
export function wireBytes(tools: ReadonlyArray<unknown>): number {
  return Buffer.byteLength(JSON.stringify(tools), 'utf8');
}

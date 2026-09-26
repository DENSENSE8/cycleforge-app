/** Write-time validation of a workflow node's `config` against its type's declared `configSchema` (from the registry). */

import { hasNode, getNode } from './registry';

type JsonType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

interface SchemaProp {
  type?: JsonType;
  options?: Array<{ value?: unknown } | unknown>;
}

interface ConfigValidationResult {
  ok: boolean;
  errors: string[];
}

function typeMatches(t: JsonType, val: unknown): boolean {
  switch (t) {
    case 'string':
      return typeof val === 'string';
    case 'number':
      return typeof val === 'number' && Number.isFinite(val);
    case 'integer':
      return typeof val === 'number' && Number.isInteger(val);
    case 'boolean':
      return typeof val === 'boolean';
    case 'array':
      return Array.isArray(val);
    case 'object':
      return val !== null && typeof val === 'object' && !Array.isArray(val);
    default:
      return true;
  }
}

/** Validate a node's full config against its type's configSchema. */
export function validateNodeConfig(
  type: string,
  config: Record<string, unknown>,
): ConfigValidationResult {
  if (!hasNode(type)) return { ok: true, errors: [] };
  const schema = getNode(type).configSchema as
    | { properties?: Record<string, SchemaProp> }
    | undefined;
  if (!schema || !schema.properties) return { ok: true, errors: [] };

  const errors: string[] = [];
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!(key in config)) continue;
    const val = config[key];
    if (val === null || val === undefined) continue;

    if (prop.type && !typeMatches(prop.type, val)) {
      errors.push(`config.${key} must be a ${prop.type}`);
      continue;
    }
    if (Array.isArray(prop.options) && prop.options.length > 0) {
      const allowed = prop.options.map((o) =>
        o !== null && typeof o === 'object' && 'value' in o
          ? (o as { value?: unknown }).value
          : o,
      );
      if (!allowed.includes(val)) {
        errors.push(`config.${key} must be one of: ${allowed.map(String).join(', ')}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

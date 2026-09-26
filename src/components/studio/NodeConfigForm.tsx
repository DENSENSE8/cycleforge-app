'use client';

/** NodeConfigForm — a generic, schema-driven node config sheet (Studio ST4, C.1). */

import type { ReactNode } from 'react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/** One field in a node's configSchema.properties. Loosely typed — schemas are JSON. */
interface SchemaField {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  enum?: unknown;
  /** Either a flat string list, or {value,label} pairs. */
  options?: unknown;
}

/** The configSchema shape we render: an object schema with named properties. */
export interface NodeConfigSchema {
  type?: unknown;
  properties?: Record<string, SchemaField> | unknown;
}

export interface NodeConfigOption {
  value: string;
  label: string;
}

interface NodeConfigFormProps {
  /** The focused node id — passed straight through to onChange. */
  nodeId: string;
  /** The node type's configSchema (from the palette entry), or null/empty. */
  schema: NodeConfigSchema | null | undefined;
  /** Current node.config values. */
  config: Record<string, unknown>;
  /** Write a partial config patch (null/'' clears the key) — provider's onUpdateNodeConfig. */
  onChange: (nodeId: string, patch: Record<string, unknown>) => void;
  /**
   * Optional host-supplied option source for a field, e.g. the `station` field
   * pulls its options from the operations-catalog STATIONS registry rather than
   * a static schema enum. Returning options turns a string field into a select.
   */
  optionsFor?: (fieldKey: string, field: SchemaField) => NodeConfigOption[] | null;
  /** Optional per-field footnote slot (e.g. the station blurb under the select). */
  renderFieldHint?: (fieldKey: string, value: unknown) => ReactNode;
}

const INPUT_CLASS =
  'w-full rounded-md border border-border-soft bg-surface-card px-2 py-1 text-xs font-medium text-text-muted';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Normalize a field's enum/options (+ host options) into {value,label} pairs, or null. */
function resolveOptions(
  fieldKey: string,
  field: SchemaField,
  optionsFor?: NodeConfigFormProps['optionsFor'],
): NodeConfigOption[] | null {
  const host = optionsFor?.(fieldKey, field);
  if (host && host.length) return host;
  if (Array.isArray(field.options) && field.options.length) {
    return field.options.map((o) =>
      typeof o === 'string'
        ? { value: o, label: o }
        : {
            value: asString((o as Record<string, unknown>)?.value),
            label:
              asString((o as Record<string, unknown>)?.label) ||
              asString((o as Record<string, unknown>)?.value),
          },
    );
  }
  if (Array.isArray(field.enum) && field.enum.length) {
    return field.enum.map((e) => ({ value: String(e), label: String(e) }));
  }
  return null;
}

export function NodeConfigForm({
  nodeId,
  schema,
  config,
  onChange,
  optionsFor,
  renderFieldHint,
}: NodeConfigFormProps) {
  const properties =
    schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, SchemaField>)
      : null;
  const fieldKeys = properties ? Object.keys(properties) : [];

  if (!properties || fieldKeys.length === 0) {
    return <p className="text-role-caption text-text-faint">No configuration for this node type.</p>;
  }

  return (
    <div className="space-y-3">
      {fieldKeys.map((key) => {
        const field = properties[key];
        const title = asString(field.title) || key;
        const description = asString(field.description);
        const type = field.type;
        const value = config[key];
        const options = resolveOptions(key, field, optionsFor);

        return (
          <div key={key} className="space-y-1">
            <label
              htmlFor={`nodecfg-${nodeId}-${key}`}
              className="block text-role-micro uppercase tracking-wider text-text-faint"
            >
              {title}
            </label>

            {type === 'boolean' ? (
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <input
                  id={`nodecfg-${nodeId}-${key}`}
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => onChange(nodeId, { [key]: e.target.checked ? true : null })}
                  className={cn("h-3.5 w-3.5 rounded border-border-default text-blue-600", focusRing('field', 'accent'))}
                  aria-label={title}
                />
                <span className="text-role-caption text-text-soft">{value === true ? 'On' : 'Off'}</span>
              </label>
            ) : type === 'number' ? (
              <input
                id={`nodecfg-${nodeId}-${key}`}
                type="number"
                value={typeof value === 'number' ? value : ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange(nodeId, { [key]: e.target.value === '' || !Number.isFinite(n) ? null : n });
                }}
                placeholder="none"
                className={INPUT_CLASS}
                aria-label={title}
              />
            ) : options ? (
              <select
                id={`nodecfg-${nodeId}-${key}`}
                value={asString(value)}
                onChange={(e) => onChange(nodeId, { [key]: e.target.value || null })}
                className={INPUT_CLASS}
                aria-label={title}
              >
                <option value="">— none —</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`nodecfg-${nodeId}-${key}`}
                type="text"
                value={asString(value)}
                onChange={(e) => onChange(nodeId, { [key]: e.target.value || null })}
                placeholder="—"
                className={INPUT_CLASS}
                aria-label={title}
              />
            )}

            {renderFieldHint?.(key, value)}
            {description && <p className="text-role-caption text-text-faint">{description}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Workflow engine — node-type registry. */

import type { NodeDefinition, NodeMeta } from './contract';

const registry = new Map<string, NodeDefinition>();

export function registerNode(def: NodeDefinition): void {
  if (registry.has(def.type)) {
    throw new Error(`Workflow node type already registered: ${def.type}`);
  }
  registry.set(def.type, def);
}

export function getNode(type: string): NodeDefinition {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown workflow node type: ${type}`);
  return def;
}

export function hasNode(type: string): boolean {
  return registry.has(type);
}

function listNodes(): NodeDefinition[] {
  return [...registry.values()];
}

/** Palette metadata (strips `run`) for the API/canvas. */
export function listNodeMeta(): NodeMeta[] {
  return listNodes().map(({ run: _run, ...meta }) => meta);
}

/** Test-only: wipe the registry between cases. */
function __clearRegistry(): void {
  registry.clear();
}

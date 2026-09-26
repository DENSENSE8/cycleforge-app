/** ai-template-vocab — the CLOSED vocabulary an AI intake assistant may use when it drafts or recommends an ops-SOP template (Template… */

import type { NodeMeta } from '@/lib/workflow/contract';
import { listNodeMeta } from '@/lib/workflow';
import { listSurfaces, type SurfaceDefinition } from '@/lib/stations/surface-keys';
import type { TemplateGraph } from './templates';

/** One allowed node type in the palette — the model-facing subset of NodeMeta. */
interface AiVocabNode {
  type: string;
  label: string;
  category: NodeMeta['category'];
  /** Output port names the model may wire edges from. */
  outputs: string[];
}

/** One allowed operator surface in the palette. */
interface AiVocabSurface {
  key: string;
  label: string;
  archetype: SurfaceDefinition['archetype'];
  /** The engine node type this surface binds to (if any) — the join a draft honors. */
  workflowNodeType: string | null;
}

interface AiTemplateVocabulary {
  nodes: AiVocabNode[];
  surfaces: AiVocabSurface[];
}

export interface VocabularyReaders {
  getNodeMeta: () => NodeMeta[];
  getSurfaces: () => SurfaceDefinition[];
}

const defaultReaders: VocabularyReaders = {
  getNodeMeta: listNodeMeta,
  getSurfaces: listSurfaces,
};

/**
 * The closed palette an AI drafter is constrained to. Derived live from the
 * registries so a newly-registered node/surface (shipped via a platform PR)
 * automatically becomes available to the assistant — and nothing else ever is.
 */
export function getAiTemplateVocabulary(readers: VocabularyReaders = defaultReaders): AiTemplateVocabulary {
  const nodes: AiVocabNode[] = readers.getNodeMeta().map((m) => ({
    type: m.type,
    label: m.label,
    category: m.category,
    outputs: m.outputs.map((o) => o.id),
  }));
  const surfaces: AiVocabSurface[] = readers.getSurfaces().map((s) => ({
    key: s.key,
    label: s.label,
    archetype: s.archetype,
    workflowNodeType: s.workflowNodeType ?? null,
  }));
  return { nodes, surfaces };
}

interface ConstrainDeps {
  hasNode: (type: string) => boolean;
  isSurfaceKey: (key: string) => boolean;
}

interface ConstrainReport {
  /** Node ids dropped because their type isn't registered. */
  droppedNodes: Array<{ id: string; type: string }>;
  /** Edge ids dropped because an endpoint node was dropped (or never existed). */
  droppedEdges: string[];
}

interface ConstrainResult {
  graph: TemplateGraph;
  report: ConstrainReport;
  /** True when nothing was dropped — the model stayed entirely on-palette. */
  clean: boolean;
}

/** Defense-in-depth: */
export function constrainDraftToVocabulary(graph: TemplateGraph, deps: ConstrainDeps): ConstrainResult {
  const droppedNodes: Array<{ id: string; type: string }> = [];
  const keptNodes = graph.nodes.filter((n) => {
    const ok = deps.hasNode(n.type);
    if (!ok) droppedNodes.push({ id: n.id, type: n.type });
    return ok;
  });
  const keptIds = new Set(keptNodes.map((n) => n.id));

  const droppedEdges: string[] = [];
  const keptEdges = graph.edges.filter((e) => {
    const ok = keptIds.has(e.source) && keptIds.has(e.target);
    if (!ok) droppedEdges.push(e.id);
    return ok;
  });

  return {
    graph: { nodes: keptNodes, edges: keptEdges },
    report: { droppedNodes, droppedEdges },
    clean: droppedNodes.length === 0 && droppedEdges.length === 0,
  };
}

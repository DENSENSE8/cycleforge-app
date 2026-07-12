/**
 * ai-template-vocab — the CLOSED vocabulary an AI intake assistant may use when
 * it drafts or recommends an ops-SOP template (Template Platform Phase 5).
 *
 * The hard invariant of the whole platform: a template may only REFERENCE
 * registered engine node types (listNodeMeta) and registered operator surfaces
 * (SURFACE_KEYS) — new capabilities require a platform PR, never an AI draft.
 * validateTemplatePackage already enforces this at import time; this module is
 * the OTHER half of the guarantee:
 *
 *   1. getAiTemplateVocabulary() — the exact palette to hand the model as its
 *      ONLY allowed node/surface vocabulary (so it is constrained at generation
 *      time, not just rejected after).
 *   2. constrainDraftToVocabulary() — a DEFENSE-IN-DEPTH pass that drops any
 *      off-palette node the model hallucinated anyway (and the edges/seeds that
 *      referenced it), returning the sanitized graph + a report of what was
 *      dropped. Whatever survives is still re-checked by validateTemplatePackage
 *      before it can be persisted/imported — this pass just means the model can
 *      never smuggle an unknown type past the draft stage.
 *
 * An AI-drafted graph is NEVER auto-activated: it terminates in the Phase-3
 * import path (importTemplatePackage → installTemplateIntoOrg activate:'never'),
 * so it always lands a draft the owner reviews + publishes. This module never
 * activates anything; it only shapes + sanitizes the proposed graph.
 *
 * Pure: registry readers are passed in (getNodeMeta / getSurfaces) or default to
 * the real registries, and the constrain pass takes injected predicates — so it
 * unit-tests with no registry bootstrap.
 */

import type { NodeMeta } from '@/lib/workflow/contract';
import { listNodeMeta } from '@/lib/workflow';
import { listSurfaces, type SurfaceDefinition } from '@/lib/stations/surface-keys';
import type { TemplateGraph } from './templates';

/** One allowed node type in the palette — the model-facing subset of NodeMeta. */
export interface AiVocabNode {
  type: string;
  label: string;
  category: NodeMeta['category'];
  /** Output port names the model may wire edges from. */
  outputs: string[];
}

/** One allowed operator surface in the palette. */
export interface AiVocabSurface {
  key: string;
  label: string;
  archetype: SurfaceDefinition['archetype'];
  /** The engine node type this surface binds to (if any) — the join a draft honors. */
  workflowNodeType: string | null;
}

export interface AiTemplateVocabulary {
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

export interface ConstrainDeps {
  hasNode: (type: string) => boolean;
  isSurfaceKey: (key: string) => boolean;
}

export interface ConstrainReport {
  /** Node ids dropped because their type isn't registered. */
  droppedNodes: Array<{ id: string; type: string }>;
  /** Edge ids dropped because an endpoint node was dropped (or never existed). */
  droppedEdges: string[];
}

export interface ConstrainResult {
  graph: TemplateGraph;
  report: ConstrainReport;
  /** True when nothing was dropped — the model stayed entirely on-palette. */
  clean: boolean;
}

/**
 * Defense-in-depth: strip any node whose type is not a registered engine node,
 * then drop every edge that referenced a removed (or missing) node. The result
 * is a graph that only names registered node types — which validateTemplatePackage
 * will still re-verify before anything is persisted. This never mutates the input.
 *
 * NOTE: this sanitizes the GRAPH (node/edge topology). Explicit surface seeds are
 * validated separately by validateTemplatePackage against isSurfaceKey; the
 * isSurfaceKey dep is accepted here so callers can share one deps object, but the
 * Phase-3 install derives surfaces from node TYPES, so graph sanitation is what
 * gates a draft.
 */
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

/** Studio Simulate — pure, client-side ghost-run over a workflow graph (Operations Studio ST6, Phase E2). */

/** Minimal edge shape the simulation needs — `StudioGraphEdge` satisfies it. */
export interface SimEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
}

/** Minimal node shape the simulation needs — `StudioGraphNode` satisfies it. */
export interface SimNode {
  id: string;
  meta?: {
    outputs?: ReadonlyArray<{ id: string; label: string }>;
  } | null;
}

/** Outcome of advancing the ghost one hop along a fired output port. */
export interface SimStepResult {
  /** The node the ghost lands on, or null when the port routes nowhere (terminal). */
  nextNodeId: string | null;
  /** The edge traversed, or null when no edge matched the fired port (terminal). */
  edgeId: string | null;
}

/** The entry node = the intake node: */
export function findEntryNode(
  nodes: ReadonlyArray<SimNode>,
  edges: ReadonlyArray<SimEdge>,
): string | null {
  if (nodes.length === 0) return null;
  const hasInbound = new Set(edges.map((e) => e.target));
  const entry = nodes.find((n) => !hasInbound.has(n.id));
  return entry ? entry.id : null;
}

/** Advance the ghost one hop: */
export function stepSimulation(
  _nodes: ReadonlyArray<SimNode>,
  edges: ReadonlyArray<SimEdge>,
  currentNodeId: string,
  firedPort: string,
): SimStepResult {
  const match = edges.find(
    (e) => e.source === currentNodeId && e.sourcePort === firedPort,
  );
  return match
    ? { nextNodeId: match.target, edgeId: match.id }
    : { nextNodeId: null, edgeId: null };
}

/** The declared output ports of a node (empty when the type declares none). */
export function outputPortsOf(node: SimNode | null | undefined): Array<{ id: string; label: string }> {
  return node?.meta?.outputs ? [...node.meta.outputs] : [];
}

/** Workflow engine — edge router. */

export interface WorkflowEdgeLike {
  sourceNode: string;
  sourcePort: string;
  targetNode: string;
}

/** Resolve the next node for (sourceNode, sourcePort) from an in-memory edge set. */
export function selectNextTarget(
  edges: readonly WorkflowEdgeLike[],
  sourceNode: string,
  sourcePort: string,
): string | null {
  const match = edges.find(
    (e) => e.sourceNode === sourceNode && e.sourcePort === sourcePort,
  );
  return match ? match.targetNode : null;
}

/** A single (sourceNode, sourcePort) that more than one edge fans out from. */
export interface PortFanOut {
  sourceNode: string;
  sourcePort: string;
  /** The target nodes the port fans to, in edge order (the first one wins at runtime). */
  targets: string[];
}

/** Ambiguity guard for first-match-wins routing. */
export function findPortFanOuts(edges: readonly WorkflowEdgeLike[]): PortFanOut[] {
  const byPort = new Map<string, PortFanOut>();
  for (const e of edges) {
    const key = `${e.sourceNode}::${e.sourcePort}`;
    const entry = byPort.get(key);
    if (entry) {
      entry.targets.push(e.targetNode);
    } else {
      byPort.set(key, {
        sourceNode: e.sourceNode,
        sourcePort: e.sourcePort,
        targets: [e.targetNode],
      });
    }
  }
  return [...byPort.values()].filter((p) => p.targets.length > 1);
}

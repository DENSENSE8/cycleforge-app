import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { STATIONS } from '@/components/admin/workflow/operations-catalog';
import type { StaticFlowGraph } from '@/lib/studio/static-flow-graph';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import type {
  Diagnostic,
  PeopleNodeCoverage,
  StudioFlowResponse,
  StudioGraphEdge,
  StudioGraphNode,
  StudioLiveNode,
} from '../studio-types';
import {
  REWORK_PORTS,
  type DepartmentNodeData,
  type ProcedureNodePaint,
  type ProcessNodeData,
} from './studio-canvas-shared';

/** Everything a lens (or the simulate overlay) paints onto the L1 graph. */
interface FlowGraphPaint {
  focus?: string | null;
  /** Live-lens per-node occupancy. */
  live?: Record<string, StudioLiveNode> | null;
  /** Gaps-lens diagnostics, pre-grouped by node. */
  gapsByNode?: Map<string, Diagnostic[]> | null;
  /** Draft edit mode (ST4): nodes drag, ports connect, edges delete. */
  editable?: boolean;
  /** Static-lens source/transform/sink projection. */
  staticFlow?: StaticFlowGraph | null;
  /** Live-lens recently-traversed edges, keyed `${sourceNode} ${sourcePort}`. */
  flowEdges?: ReadonlySet<string> | null;
  /** Flow²-lens throughput metrics. */
  flow?: StudioFlowResponse | null;
  /** People-lens staffing coverage. */
  people?: Record<string, PeopleNodeCoverage> | null;
  /** Procedure-lens step + table box, keyed by node id. */
  procedure?: ReadonlyMap<string, ProcedureNodePaint> | null;
  /** Simulate overlay: node the ghost currently occupies. */
  simGhostNodeId?: string | null;
  /** Simulate overlay: edge ids the ghost has walked. */
  simTraversedEdgeIds?: ReadonlySet<string> | null;
}

export function buildFlowGraph(
  nodes: StudioGraphNode[],
  edges: StudioGraphEdge[],
  paint: FlowGraphPaint = {},
) {
  const {
    focus = null,
    live = null,
    gapsByNode = null,
    editable = false,
    staticFlow = null,
    flowEdges = null,
    flow = null,
    people = null,
    procedure = null,
    simGhostNodeId = null,
    simTraversedEdgeIds = null,
  } = paint;
  const metaByNode = new Map(nodes.map((n) => [n.id, n.meta]));
  // Flow² lens: which node instances rank as bottlenecks, and the busiest edge
  // so we can normalize stroke thickness against the heaviest traffic.
  const bottleneckIds = flow ? new Set(flow.bottlenecks.map((b) => b.nodeId)) : null;
  const maxEdgeVolume = flow
    ? Math.max(1, ...Object.values(flow.edges).map((m) => m.volume))
    : 0;

  const rfNodes: Node[] = nodes.map((n) => {
    const sf = staticFlow?.byId.get(n.id) ?? null;
    return {
      id: n.id,
      type: 'process',
      position: { x: n.x, y: n.y },
      data: {
        node: n,
        focused: n.id === focus,
        dimmed: !editable && focus != null && n.id !== focus,
        live: live?.[n.id] ?? null,
        gaps: gapsByNode?.get(n.id) ?? [],
        staticRole: sf?.role ?? null,
        staticDangling: sf?.danglingPorts ?? [],
        flow: flow?.nodes[n.id] ?? null,
        flowBottleneck: bottleneckIds?.has(n.id) ?? false,
        people: people?.[n.id] ?? null,
        procedure: procedure?.get(n.id) ?? null,
        simGhost: simGhostNodeId === n.id,
      } satisfies ProcessNodeData,
    };
  });

  const rfEdges: Edge[] = edges.map((e) => {
    const rework = REWORK_PORTS.has(e.sourcePort);
    // A unit just traversed this edge — pulse it blue for the Live lens.
    const flowing = flowEdges?.has(`${e.source} ${e.sourcePort}`) ?? false;
    // Simulate overlay: the ghost has walked this edge — tint it violet. Orthogonal
    // to every lens (it's an overlay, not a lens) so it wins the edge styling.
    const ghosted = simTraversedEdgeIds?.has(e.id) ?? false;
    const sourceMeta = metaByNode.get(e.source);
    const stroke = ghosted ? '#7c3aed' : flowing ? '#2563eb' : rework ? '#fda4af' : '#94a3b8';

    // Flow² lens: thickness/opacity by edge volume (thicker = more traffic),
    // normalized against the busiest edge in the window.
    if (flow) {
      const volume = flow.edges[e.id]?.volume ?? 0;
      const ratio = maxEdgeVolume > 0 ? volume / maxEdgeVolume : 0;
      const flowStroke = ghosted ? '#7c3aed' : rework ? '#fda4af' : '#94a3b8';
      return {
        id: e.id,
        source: e.source,
        sourceHandle: sourceMeta?.outputs.some((o) => o.id === e.sourcePort) ? e.sourcePort : undefined,
        target: e.target,
        label: volume > 0 ? `${e.sourcePort} · ${volume}` : e.sourcePort,
        animated: ghosted,
        labelStyle: { fontSize: 10, fontWeight: 600, fill: ghosted ? '#7c3aed' : rework ? '#e11d48' : '#475569' },
        style: {
          stroke: flowStroke,
          strokeWidth: ghosted ? 3 : 1 + ratio * 7,
          opacity: ghosted ? 1 : 0.35 + ratio * 0.65,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: flowStroke },
      };
    }

    return {
      id: e.id,
      source: e.source,
      // Attach to the named port handle when the source declares it.
      sourceHandle: sourceMeta?.outputs.some((o) => o.id === e.sourcePort) ? e.sourcePort : undefined,
      target: e.target,
      label: e.sourcePort,
      animated: ghosted || flowing || rework,
      labelStyle: {
        fontSize: 10,
        fontWeight: 600,
        fill: ghosted ? '#7c3aed' : flowing ? '#2563eb' : rework ? '#e11d48' : '#475569',
      },
      style: { stroke, strokeWidth: ghosted || flowing ? 3 : editable ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    };
  });

  return { rfNodes, rfEdges };
}

export function buildBusinessMap(
  nodes: StudioGraphNode[],
  edges: StudioGraphEdge[],
  live: Record<string, StudioLiveNode> | null,
) {
  // Group process nodes into departments by their bound station.
  const groups = new Map<string, StudioGraphNode[]>();
  for (const n of nodes) {
    const key = String(n.config.station ?? 'UNASSIGNED');
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }

  const nodeStation = new Map(nodes.map((n) => [n.id, String(n.config.station ?? 'UNASSIGNED')]));

  const rfNodes: Node[] = [...groups.entries()].map(([key, members]) => {
    const station = STATIONS.find((s) => s.key === key);
    const cx = members.reduce((sum, m) => sum + m.x, 0) / members.length;
    const cy = members.reduce((sum, m) => sum + m.y, 0) / members.length;
    return {
      id: `dept:${key}`,
      type: 'department',
      position: { x: cx, y: cy },
      data: {
        label: station?.label ?? sentenceCaseLabel(key),
        color: station?.color ?? '#94a3b8',
        stepCount: members.length,
        stepLabels: members.map((m) => m.meta?.label ?? m.type),
        inFlight: live ? members.reduce((sum, m) => sum + (live[m.id]?.total ?? 0), 0) : null,
      } satisfies DepartmentNodeData,
    };
  });

  // Aggregate edges between distinct departments; collect the ports involved.
  const agg = new Map<string, { source: string; target: string; ports: string[] }>();
  for (const e of edges) {
    const src = nodeStation.get(e.source);
    const dst = nodeStation.get(e.target);
    if (!src || !dst || src === dst) continue;
    const key = `${src}→${dst}`;
    const entry = agg.get(key) ?? { source: `dept:${src}`, target: `dept:${dst}`, ports: [] };
    entry.ports.push(e.sourcePort);
    agg.set(key, entry);
  }

  const rfEdges: Edge[] = [...agg.entries()].map(([key, a]) => ({
    id: `agg:${key}`,
    source: a.source,
    target: a.target,
    label: a.ports.join(' · '),
    labelStyle: { fontSize: 10, fontWeight: 600, fill: '#475569' },
    style: { stroke: '#94a3b8', strokeWidth: Math.min(1 + a.ports.length, 4) },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
  }));

  return { rfNodes, rfEdges };
}

'use client';

/** StudioCanvas — the React Flow surface behind the Studio. */

import { useCallback, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { buildStaticFlowGraph } from '@/lib/studio/static-flow-graph';
import { buildStationProcedureMap } from '@/lib/studio/station-procedure-map';
import { procedureForNodeType } from '@/lib/stations/procedure';
import { listDataSourceMeta } from '@/lib/stations/data-sources';
import { registerStationBuiltins } from '@/lib/stations';
import type { Diagnostic } from './studio-types';
import {
  CanvasProps,
  STATIC_ROLE,
  type AnnotationNodeData,
  type ProcedureNodePaint,
} from './canvas/studio-canvas-shared';
import { NODE_TYPES } from './canvas/StudioCanvasNodes';
import { buildBusinessMap, buildFlowGraph } from './canvas/studio-canvas-graph';

// ─── Canvas ──────────────────────────────────────────────────

export function StudioCanvas({
  nodes,
  edges,
  zoom,
  lens,
  live,
  flowEdges,
  flow,
  people,
  diagnostics,
  focus,
  editable = false,
  onGraphChange,
  onFocus,
  onZoomTo,
  onOpenStation,
  simGhostNodeId = null,
  simTraversedEdgeIds,
  annotations,
  onMoveAnnotation,
  onUpdateAnnotationText,
  onDeleteAnnotation,
}: CanvasProps) {
  const liveMap = lens === 'live' ? live : null;
  // Per-edge flow pulses only paint under the Live lens.
  const flowMap = lens === 'live' ? flowEdges ?? null : null;
  // Flow² throughput metrics only paint under the Flow² lens.
  const flowMetrics = lens === 'flow' ? flow ?? null : null;
  // People coverage only paints under the People lens.
  const peopleMap = lens === 'people' ? people ?? null : null;
  const gapsByNode = useMemo(() => {
    if (lens !== 'gaps') return null;
    const map = new Map<string, Diagnostic[]>();
    for (const d of diagnostics) {
      if (!d.nodeId || d.severity === 'info') continue;
      const list = map.get(d.nodeId) ?? [];
      list.push(d);
      map.set(d.nodeId, list);
    }
    return map;
  }, [lens, diagnostics]);
  // Static lens: pure projection of the already-fetched graph (no fetch, no poll).
  const staticFlow = useMemo(
    () => (lens === 'static' ? buildStaticFlowGraph(nodes, edges) : null),
    [lens, nodes, edges],
  );
  // Procedure lens:
  const procedureByNode = useMemo(() => {
    if (lens !== 'procedure') return null;
    registerStationBuiltins();
    const sources = new Map(listDataSourceMeta().map((s) => [s.id, s]));
    const byProcedure = new Map<string, ProcedureNodePaint>();
    const paint = new Map<string, ProcedureNodePaint>();
    for (const n of nodes) {
      const declared = procedureForNodeType(n.type);
      if (!declared) continue;
      let box = byProcedure.get(declared.surface);
      if (!box) {
        const map = buildStationProcedureMap(declared, { sources, actions: new Map() });
        box = {
          label: map.label,
          steps: map.counts.steps,
          composed: map.counts.composed,
          readTables: map.tables.reads,
          writeTables: map.tables.writes,
        };
        byProcedure.set(declared.surface, box);
      }
      paint.set(n.id, box);
    }
    return paint;
  }, [lens, nodes]);
  const { rfNodes, rfEdges } = useMemo(() => {
    if (zoom === 1)
      return buildFlowGraph(nodes, edges, {
        focus,
        live: liveMap,
        gapsByNode,
        editable,
        staticFlow,
        flowEdges: flowMap,
        flow: flowMetrics,
        people: peopleMap,
        procedure: procedureByNode,
        simGhostNodeId,
        simTraversedEdgeIds: simTraversedEdgeIds ?? null,
      });
    return buildBusinessMap(nodes, edges, liveMap);
  }, [
    nodes,
    edges,
    zoom,
    focus,
    liveMap,
    gapsByNode,
    editable,
    staticFlow,
    flowMap,
    flowMetrics,
    peopleMap,
    procedureByNode,
    simGhostNodeId,
    simTraversedEdgeIds,
  ]);

  // Sticky-note annotations (Phase E3) ride on both depths as a decoration
  // layer — never engine nodes, so they live OUTSIDE the graph builders and
  // simply append to whatever rfNodes the active depth produced.
  const annotationNodes = useMemo<Node[]>(
    () =>
      (annotations ?? []).map((a) => ({
        id: a.id,
        type: 'annotation',
        position: { x: a.x, y: a.y },
        draggable: editable,
        selectable: editable,
        data: {
          annotation: a,
          editable,
          onUpdateText: onUpdateAnnotationText,
          onDelete: onDeleteAnnotation,
        } satisfies AnnotationNodeData,
      })),
    [annotations, editable, onUpdateAnnotationText, onDeleteAnnotation],
  );

  const allNodes = useMemo(() => [...rfNodes, ...annotationNodes], [rfNodes, annotationNodes]);

  // ─── Edit handlers (controlled graph — every change flows up) ───
  const annotationIds = useMemo(
    () => new Set((annotations ?? []).map((a) => a.id)),
    [annotations],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!editable) return;
      const moved = changes.filter(
        (c): c is Extract<NodeChange, { type: 'position' }> => c.type === 'position' && !!c.position,
      );
      if (moved.length === 0) return;
      // Annotation moves go to the annotation handler; graph-node moves flow up
      // through onGraphChange. Splitting here keeps the two layers independent.
      for (const c of moved) {
        if (annotationIds.has(c.id)) onMoveAnnotation?.(c.id, c.position!.x, c.position!.y);
      }
      const graphMoves = moved.filter((c) => !annotationIds.has(c.id));
      if (graphMoves.length > 0 && onGraphChange) {
        const byId = new Map(graphMoves.map((c) => [c.id, c.position!]));
        onGraphChange({
          nodes: nodes.map((n) => {
            const pos = byId.get(n.id);
            return pos ? { ...n, x: pos.x, y: pos.y } : n;
          }),
        });
      }
    },
    [editable, onGraphChange, nodes, annotationIds, onMoveAnnotation],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!editable || !onGraphChange || !connection.source || !connection.target) return;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const sourcePort =
        connection.sourceHandle ?? sourceNode?.meta?.outputs[0]?.id ?? 'done';
      // One port → one target (the engine resolves first match): a new
      // connection from an already-wired port replaces that port's edge.
      const kept = edges.filter(
        (e) => !(e.source === connection.source && e.sourcePort === sourcePort),
      );
      onGraphChange({
        edges: [
          ...kept,
          {
            id: `e-${safeRandomUUID()}`,
            source: connection.source,
            sourcePort,
            target: connection.target,
          },
        ],
      });
    },
    [editable, onGraphChange, nodes, edges],
  );

  const handleEdgeClick = useCallback(
    (evt: React.MouseEvent, edge: Edge) => {
      if (!editable || !onGraphChange) return;
      evt.stopPropagation();
      onGraphChange({ edges: edges.filter((e) => e.id !== edge.id) });
    },
    [editable, onGraphChange, edges],
  );

  return (
    <ReactFlow
      key={`${zoom}-${editable ? 'edit' : 'view'}`} // re-fit on depth/mode change; lens switches never touch this
      nodes={allNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
      minZoom={0.3}
      maxZoom={1.75}
      nodesDraggable={editable}
      nodesConnectable={editable}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      onNodesChange={editable ? handleNodesChange : undefined}
      onConnect={editable ? handleConnect : undefined}
      onEdgeClick={editable ? handleEdgeClick : undefined}
      onNodeClick={(_evt, n) => {
        // Annotations are decorations — clicking one never changes node focus.
        if (n.type === 'annotation') return;
        if (zoom === 1) onFocus(n.id === focus ? null : n.id);
      }}
      onNodeDoubleClick={(_evt, n) => {
        if (zoom === 0 && n.type === 'department') onZoomTo(1);
        else if (zoom === 1 && n.type === 'process' && !editable) onOpenStation?.(n.id);
      }}
      onPaneClick={() => onFocus(null)}
    >
      <Background gap={18} size={1.2} color="#cbd5e1" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-surface-sunken" />
      {lens === 'static' && zoom === 1 && staticFlow && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-3 rounded-lg border border-border-soft bg-surface-card/90 px-3 py-1.5 text-role-micro font-semibold text-text-muted shadow-sm">
          <span className="text-text-faint">Data flow</span>
          {(
            [
              [STATIC_ROLE.source.color, 'Sources', staticFlow.counts.sources],
              [STATIC_ROLE.transform.color, 'Transforms', staticFlow.counts.transforms],
              [STATIC_ROLE.sink.color, 'Sinks', staticFlow.counts.sinks],
            ] as const
          ).map(([color, label, count]) => (
            <span key={label} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {label} <span className="tabular-nums text-text-faint">{count}</span>
            </span>
          ))}
        </div>
      )}
      {lens === 'procedure' && zoom === 1 && procedureByNode && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-3 rounded-lg border border-border-soft bg-surface-card/90 px-3 py-1.5 text-role-micro font-semibold text-text-muted shadow-sm">
          <span className="text-text-faint">Procedure</span>
          {procedureByNode.size === 0 ? (
            <span className="text-text-faint">No step sequence declared for these node types yet</span>
          ) : (
            <>
              <span className="tabular-nums">
                {procedureByNode.size} mapped nodes
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-500" /> reads
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> writes
              </span>
              <span className="text-text-faint">double-click a step for its full procedure</span>
            </>
          )}
        </div>
      )}
      {editable && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-surface-inverse/80 px-3 py-1 text-role-micro font-medium text-white">
          drag nodes to move · drag a port to wire it · click an edge to remove it
        </div>
      )}
    </ReactFlow>
  );
}

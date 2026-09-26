/** Studio law #3, pinned: */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowGraph } from './studio-canvas-graph';
import type { ProcedureNodePaint } from './studio-canvas-shared';
import type { StudioGraphEdge, StudioGraphNode } from '../studio-types';

const nodes: StudioGraphNode[] = [
  {
    id: 'n1',
    type: 'receiving',
    x: 120,
    y: 40,
    config: { station: 'RECEIVING' },
    meta: { label: 'Receive', icon: 'Box', category: 'intake', outputs: [{ id: 'done', label: 'Done' }] },
  },
  {
    id: 'n2',
    type: 'inspection',
    x: 420,
    y: 260,
    config: { station: 'TECH' },
    meta: { label: 'Inspect', icon: 'Box', category: 'process', outputs: [{ id: 'pass', label: 'Pass' }] },
  },
];

const edges: StudioGraphEdge[] = [
  { id: 'e1', source: 'n1', sourcePort: 'done', target: 'n2' },
];

const paint = new Map<string, ProcedureNodePaint>([
  [
    'n1',
    { label: 'Unbox', steps: 7, composed: 1, readTables: ['receiving_carton'], writeTables: ['serial_units'] },
  ],
]);

function positions(result: ReturnType<typeof buildFlowGraph>) {
  return result.rfNodes.map((n) => ({ id: n.id, position: n.position }));
}

test('the Procedure lens changes no node position', () => {
  const off = buildFlowGraph(nodes, edges);
  const on = buildFlowGraph(nodes, edges, { procedure: paint });
  assert.deepEqual(positions(on), positions(off));
  assert.deepEqual(positions(off), [
    { id: 'n1', position: { x: 120, y: 40 } },
    { id: 'n2', position: { x: 420, y: 260 } },
  ]);
});

test('the Procedure lens changes no edge', () => {
  const off = buildFlowGraph(nodes, edges);
  const on = buildFlowGraph(nodes, edges, { procedure: paint });
  assert.deepEqual(on.rfEdges, off.rfEdges);
});

test('the paint reaches only the nodes it is keyed to', () => {
  const on = buildFlowGraph(nodes, edges, { procedure: paint });
  const byId = new Map(on.rfNodes.map((n) => [n.id, n.data as { procedure: ProcedureNodePaint | null }]));
  assert.equal(byId.get('n1')!.procedure?.steps, 7);
  assert.equal(byId.get('n2')!.procedure, null, 'a node with no declared procedure paints nothing');
});

test('with the lens off every node paints nothing', () => {
  const off = buildFlowGraph(nodes, edges);
  for (const n of off.rfNodes) {
    assert.equal((n.data as { procedure: ProcedureNodePaint | null }).procedure, null);
  }
});

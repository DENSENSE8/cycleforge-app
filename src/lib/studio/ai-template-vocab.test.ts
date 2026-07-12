/**
 * DB-free tests for ai-template-vocab (Phase 5). Registry readers + predicates
 * are injected, so we assert: the palette is derived from the registries, and
 * the constrain pass drops off-palette nodes + their dangling edges while leaving
 * a fully on-palette graph untouched.
 *   npx tsx --test src/lib/studio/ai-template-vocab.test.ts
 */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAiTemplateVocabulary,
  constrainDraftToVocabulary,
  type VocabularyReaders,
} from './ai-template-vocab';
import type { NodeMeta } from '@/lib/workflow/contract';
import type { SurfaceDefinition } from '@/lib/stations/surface-keys';
import type { TemplateGraph } from './templates';

const NODE_META: NodeMeta[] = [
  { type: 'receiving', label: 'Receiving', icon: 'Box', category: 'intake', outputs: [{ id: 'out', label: 'Out' }] } as NodeMeta,
  { type: 'inspection', label: 'Inspection', icon: 'Check', category: 'process', outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }] } as NodeMeta,
];

const SURFACES = [
  { key: 'unbox', label: 'Unbox', archetype: 'station', workflowNodeType: 'receiving' },
  { key: 'test', label: 'Test', archetype: 'station', workflowNodeType: 'inspection' },
] as unknown as SurfaceDefinition[];

const readers: VocabularyReaders = { getNodeMeta: () => NODE_META, getSurfaces: () => SURFACES };

test('getAiTemplateVocabulary derives the palette from the registries', () => {
  const vocab = getAiTemplateVocabulary(readers);
  assert.deepEqual(vocab.nodes.map((n) => n.type), ['receiving', 'inspection']);
  // outputs flattened to names
  assert.deepEqual(vocab.nodes[1].outputs, ['pass', 'fail']);
  assert.deepEqual(vocab.surfaces.map((s) => s.key), ['unbox', 'test']);
  assert.equal(vocab.surfaces[0].workflowNodeType, 'receiving');
});

const registered = new Set(['receiving', 'inspection']);
const deps = { hasNode: (t: string) => registered.has(t), isSurfaceKey: (k: string) => k === 'unbox' || k === 'test' };

test('constrainDraftToVocabulary keeps a fully on-palette graph intact', () => {
  const graph: TemplateGraph = {
    nodes: [
      { id: 'a', type: 'receiving', x: 0, y: 0, config: {} },
      { id: 'b', type: 'inspection', x: 1, y: 0, config: {} },
    ],
    edges: [{ id: 'e1', source: 'a', sourcePort: 'out', target: 'b' }],
  };
  const res = constrainDraftToVocabulary(graph, deps);
  assert.equal(res.clean, true);
  assert.equal(res.graph.nodes.length, 2);
  assert.equal(res.graph.edges.length, 1);
});

test('constrainDraftToVocabulary drops an off-palette node and its dangling edge', () => {
  const graph: TemplateGraph = {
    nodes: [
      { id: 'a', type: 'receiving', x: 0, y: 0, config: {} },
      { id: 'x', type: 'teleporter', x: 1, y: 0, config: {} }, // hallucinated type
    ],
    edges: [{ id: 'e1', source: 'a', sourcePort: 'out', target: 'x' }],
  };
  const res = constrainDraftToVocabulary(graph, deps);
  assert.equal(res.clean, false);
  assert.deepEqual(res.report.droppedNodes, [{ id: 'x', type: 'teleporter' }]);
  assert.deepEqual(res.report.droppedEdges, ['e1']);
  assert.deepEqual(res.graph.nodes.map((n) => n.id), ['a']);
  assert.equal(res.graph.edges.length, 0);
});

test('constrainDraftToVocabulary does not mutate its input', () => {
  const graph: TemplateGraph = {
    nodes: [{ id: 'x', type: 'teleporter', x: 0, y: 0, config: {} }],
    edges: [],
  };
  constrainDraftToVocabulary(graph, deps);
  assert.equal(graph.nodes.length, 1); // original untouched
});

/** DB-free tests for the CycleForgeTemplatePackage v1 contract (Phase 3): */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTemplatePackage,
  buildTemplatePackage,
  CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION,
  type TemplatePackageV1,
  type ValidatePackageDeps,
} from './template-package';

const REGISTERED = new Set(['receiving', 'inspection', 'pack', 'ship']);
const SURFACES = new Set(['unbox', 'triage', 'test', 'pack', 'outbound']);
const deps: ValidatePackageDeps = {
  hasNode: (t) => REGISTERED.has(t),
  isSurfaceKey: (k) => SURFACES.has(k),
};

function goodPackage(over: Partial<TemplatePackageV1> = {}): TemplatePackageV1 {
  return {
    schemaVersion: CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION,
    metadata: { slug: 'my-shop', name: 'My Shop', description: null, category: 'refurb' },
    engineCompat: { requiredNodeTypes: ['inspection', 'receiving'] },
    graph: {
      nodes: [
        { id: 'recv', type: 'receiving', x: 0, y: 0, config: {} },
        { id: 'insp', type: 'inspection', x: 100, y: 0, config: {} },
      ],
      edges: [{ id: 'e1', source: 'recv', sourcePort: 'out', target: 'insp' }],
    },
    ...over,
  };
}

test('a well-formed package validates', () => {
  const res = validateTemplatePackage(goodPackage(), deps);
  assert.equal(res.ok, true);
});

test('wrong schemaVersion fails on shape', () => {
  const res = validateTemplatePackage({ ...goodPackage(), schemaVersion: 2 }, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors.some((e) => e.includes('schemaVersion')));
});

test('an unregistered node type is rejected (needs a platform PR)', () => {
  const pkg = goodPackage({
    engineCompat: { requiredNodeTypes: ['receiving', 'teleport'] },
    graph: {
      nodes: [
        { id: 'recv', type: 'receiving', x: 0, y: 0, config: {} },
        { id: 'tp', type: 'teleport', x: 1, y: 0, config: {} },
      ],
      edges: [],
    },
  });
  const res = validateTemplatePackage(pkg, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors.some((e) => e.includes('teleport')));
});

test('a graph node type missing from requiredNodeTypes is rejected', () => {
  const pkg = goodPackage({
    engineCompat: { requiredNodeTypes: ['receiving'] }, // omits inspection
  });
  const res = validateTemplatePackage(pkg, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors.some((e) => e.includes('inspection') && e.includes('requiredNodeTypes')));
});

test('a dangling edge endpoint is rejected', () => {
  const pkg = goodPackage({
    graph: {
      nodes: [{ id: 'recv', type: 'receiving', x: 0, y: 0, config: {} }],
      edges: [{ id: 'e1', source: 'recv', sourcePort: 'out', target: 'ghost' }],
    },
    engineCompat: { requiredNodeTypes: ['receiving'] },
  });
  const res = validateTemplatePackage(pkg, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors.some((e) => e.includes('ghost')));
});

test('an optional surfaceSeed to an unknown surface or node is rejected', () => {
  const badSurface = goodPackage({
    surfaceSeeds: [{ surfaceKey: 'nope', pageKey: 'p', modeKey: 'm', workflowNodeId: 'recv', label: 'L' }],
  });
  assert.equal(validateTemplatePackage(badSurface, deps).ok, false);

  const badNode = goodPackage({
    surfaceSeeds: [{ surfaceKey: 'unbox', pageKey: 'p', modeKey: 'm', workflowNodeId: 'ghost', label: 'L' }],
  });
  assert.equal(validateTemplatePackage(badNode, deps).ok, false);

  const good = goodPackage({
    surfaceSeeds: [{ surfaceKey: 'unbox', pageKey: 'receiving', modeKey: 'receive', workflowNodeId: 'recv', label: 'Unbox' }],
  });
  assert.equal(validateTemplatePackage(good, deps).ok, true);
});

test('buildTemplatePackage derives requiredNodeTypes (sorted, distinct) from the graph', () => {
  const pkg = buildTemplatePackage({
    metadata: { slug: 'x', name: 'X' },
    graph: {
      nodes: [
        { id: 'a', type: 'ship', x: 0, y: 0 },
        { id: 'b', type: 'receiving', x: 1, y: 0 },
        { id: 'c', type: 'receiving', x: 2, y: 0 },
      ],
      edges: [{ id: 'e', source: 'b', sourcePort: 'out', target: 'a' }],
    },
  });
  assert.deepEqual(pkg.engineCompat.requiredNodeTypes, ['receiving', 'ship']);
  assert.equal(pkg.schemaVersion, CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION);
  // Round-trips through the validator.
  assert.equal(validateTemplatePackage(pkg, deps).ok, true);
});

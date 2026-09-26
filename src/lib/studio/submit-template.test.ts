/** DB-free tests for submitTemplateFromDefinition (Phase 4). */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { submitTemplateFromDefinition, type SubmitTemplateDeps } from './submit-template';
import type { TemplateGraph } from './templates';
import type { TemplatePackageV1 } from './template-package';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;

const GRAPH: TemplateGraph = {
  nodes: [
    { id: 'recv', type: 'receiving', x: 0, y: 0, config: {} },
    { id: 'insp', type: 'inspection', x: 200, y: 0, config: {} },
  ],
  edges: [{ id: 'e1', source: 'recv', sourcePort: 'out', target: 'insp' }],
};

function fakes(graph: { name: string; graph: TemplateGraph } | null = { name: 'My Live Flow', graph: GRAPH }) {
  const cap = {
    loaded: [] as Array<{ orgId: OrgId; definitionId: number }>,
    persisted: [] as Array<{ pkg: TemplatePackageV1; orgId: OrgId }>,
  };
  const deps: SubmitTemplateDeps = {
    loadDefinitionGraph: async (orgId, definitionId) => {
      cap.loaded.push({ orgId, definitionId });
      return graph;
    },
    persistSubmission: async (pkg, ctx) => {
      cap.persisted.push({ pkg, orgId: ctx.orgId });
      return { templateId: 777, slug: pkg.metadata.slug };
    },
  };
  return { deps, cap };
}

test('serializes the org definition into a package and persists it as a submission', async () => {
  const { deps, cap } = fakes();
  const out = await submitTemplateFromDefinition({ orgId: ORG, definitionId: 42 }, deps);

  // read was org-scoped to the caller's own definition
  assert.deepEqual(cap.loaded[0], { orgId: ORG, definitionId: 42 });

  // package derived from the graph: requiredNodeTypes sorted-distinct from nodes
  assert.equal(cap.persisted.length, 1);
  const pkg = cap.persisted[0].pkg;
  assert.deepEqual(pkg.engineCompat.requiredNodeTypes, ['inspection', 'receiving']);
  assert.equal(pkg.graph.nodes.length, 2);
  assert.equal(pkg.graph.edges.length, 1);
  assert.equal(pkg.metadata.slug, 'my-live-flow'); // slugified from the definition name
  assert.equal(cap.persisted[0].orgId, ORG); // submitted_by_org threaded

  assert.equal(out.status, 200);
  assert.equal(out.submitted, true);
  assert.equal(out.templateId, 777);
  assert.equal(out.templateSlug, 'my-live-flow');
});

test('metadata overrides win over the definition name', async () => {
  const { deps, cap } = fakes();
  await submitTemplateFromDefinition(
    { orgId: ORG, definitionId: 42, metadata: { name: 'Curated Name', description: 'desc', category: 'electronics' } },
    deps,
  );
  const pkg = cap.persisted[0].pkg;
  assert.equal(pkg.metadata.name, 'Curated Name');
  assert.equal(pkg.metadata.slug, 'curated-name');
  assert.equal(pkg.metadata.description, 'desc');
  assert.equal(pkg.metadata.category, 'electronics');
});

test('a missing / non-owned definition 404s without persisting', async () => {
  const { deps, cap } = fakes(null);
  const out = await submitTemplateFromDefinition({ orgId: ORG, definitionId: 999 }, deps);
  assert.equal(out.status, 404);
  assert.equal(out.submitted, false);
  assert.equal(out.templateId, null);
  assert.equal(cap.persisted.length, 0); // never wrote a row
});

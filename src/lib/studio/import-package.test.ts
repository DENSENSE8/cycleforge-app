/** DB-free tests for importTemplatePackage (Phase 3). */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { importTemplatePackage, type ImportTemplatePackageDeps } from './import-package';
import type { InstallTemplateArgs, InstallTemplateResult } from './install-template';
import type { TemplatePackageV1 } from './template-package';
import { CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION } from './template-package';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;

const PKG: TemplatePackageV1 = {
  schemaVersion: CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION,
  metadata: { slug: 'my-shop', name: 'My Shop' },
  engineCompat: { requiredNodeTypes: ['receiving'] },
  graph: { nodes: [{ id: 'recv', type: 'receiving', x: 0, y: 0, config: {} }], edges: [] },
};

function fakes(over: Partial<InstallTemplateResult> = {}) {
  const cap = {
    persisted: [] as TemplatePackageV1[],
    installArgs: [] as InstallTemplateArgs[],
  };
  const deps: ImportTemplatePackageDeps = {
    persistTemplate: async (pkg) => {
      cap.persisted.push(pkg);
      return { templateId: 555, slug: 'my-shop-2' };
    },
    install: (async (args: InstallTemplateArgs) => {
      cap.installArgs.push(args);
      return {
        status: 200,
        seeded: true,
        definitionId: 99,
        version: 1,
        templateId: 555,
        templateSlug: 'my-shop-2',
        name: 'My Shop',
        nodes: 1,
        edges: 0,
        surfacesSeeded: 5,
        activated: false,
        ...over,
      } satisfies InstallTemplateResult;
    }) as ImportTemplatePackageDeps['install'],
  };
  return { deps, cap };
}

test('persists the package then installs it as a DRAFT (activate: never)', async () => {
  const { deps, cap } = fakes();
  const out = await importTemplatePackage({ orgId: ORG, staffId: 7, package: PKG }, deps);

  assert.equal(cap.persisted.length, 1);
  assert.equal(cap.persisted[0].metadata.slug, 'my-shop');
  // installed by the persisted template id, never activated.
  assert.equal(cap.installArgs[0].templateId, 555);
  assert.equal(cap.installArgs[0].activate, 'never');
  assert.equal(cap.installArgs[0].orgId, ORG);
  assert.equal(cap.installArgs[0].staffId, 7);

  assert.equal(out.status, 200);
  assert.equal(out.seeded, true);
  assert.equal(out.definitionId, 99);
  assert.equal(out.surfacesSeeded, 5);
  assert.equal(out.templateSlug, 'my-shop-2'); // suffixed unique slug flows back
});

test('nameOverride is threaded to the install draft name', async () => {
  const { deps, cap } = fakes();
  await importTemplatePackage({ orgId: ORG, staffId: 7, package: PKG, nameOverride: 'Custom Name' }, deps);
  assert.equal(cap.installArgs[0].name, 'Custom Name');
});

test('a clone failure from install surfaces in the result', async () => {
  const { deps } = fakes({ status: 404, seeded: false, definitionId: null, version: null, surfacesSeeded: 0, reason: 'template not found' });
  const out = await importTemplatePackage({ orgId: ORG, staffId: 7, package: PKG }, deps);
  assert.equal(out.status, 404);
  assert.equal(out.seeded, false);
  assert.equal(out.reason, 'template not found');
});

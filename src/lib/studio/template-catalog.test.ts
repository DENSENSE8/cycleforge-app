/** DB-free tests for the applyTemplateToOrg thin wrapper (Template Platform Phase 2A). */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplateToOrg, type ApplyTemplateDeps } from './template-catalog';
import type { InstallTemplateArgs, InstallTemplateResult } from './install-template';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;

function fakes(result: Partial<InstallTemplateResult> = {}) {
  const cap = { installArgs: [] as InstallTemplateArgs[] };
  const deps: ApplyTemplateDeps = {
    install: (async (args: InstallTemplateArgs) => {
      cap.installArgs.push(args);
      return {
        status: 200,
        seeded: true,
        definitionId: 99,
        version: 1,
        templateId: args.templateId ?? 7,
        templateSlug: 'electronics-av-refurb',
        name: 'Electronics',
        nodes: 3,
        edges: 2,
        surfacesSeeded: 4,
        activated: args.activate === 'always',
        ...result,
      } satisfies InstallTemplateResult;
    }) as ApplyTemplateDeps['install'],
  };
  return { deps, cap };
}

test('activate=true maps to policy "always" and forwards skipIfExists', async () => {
  const { deps, cap } = fakes();
  const out = await applyTemplateToOrg({ orgId: ORG, staffId: 3, activate: true, skipIfExists: true }, deps);
  assert.deepEqual(cap.installArgs[0], { orgId: ORG, staffId: 3, templateId: undefined, activate: 'always', skipIfExists: true });
  assert.equal(out.seeded, true);
  assert.equal(out.definitionId, 99);
  assert.equal(out.activated, true);
  assert.equal(out.surfacesSeeded, 4);
});

test('activate omitted maps to policy "never" (draft only)', async () => {
  const { deps, cap } = fakes();
  const out = await applyTemplateToOrg({ orgId: ORG, staffId: 3, templateId: 42 }, deps);
  assert.equal(cap.installArgs[0].activate, 'never');
  assert.equal(cap.installArgs[0].templateId, 42);
  assert.equal(out.activated, false);
});

test('propagates a skip result unchanged', async () => {
  const { deps } = fakes({ seeded: false, definitionId: null, activated: false, surfacesSeeded: 0, reason: 'org already has a definition' });
  const out = await applyTemplateToOrg({ orgId: ORG, staffId: 3, activate: true, skipIfExists: true }, deps);
  assert.equal(out.seeded, false);
  assert.equal(out.reason, 'org already has a definition');
});

test('propagates a 404 (no template) result', async () => {
  const { deps } = fakes({ status: 404, seeded: false, definitionId: null, activated: false, surfacesSeeded: 0, reason: 'no system template seeded' });
  const out = await applyTemplateToOrg({ orgId: ORG, staffId: null, activate: true }, deps);
  assert.equal(out.status, 404);
  assert.equal(out.seeded, false);
});

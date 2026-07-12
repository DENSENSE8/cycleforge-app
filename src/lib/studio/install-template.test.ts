/**
 * DB-free tests for installTemplateIntoOrg (Template Platform Phase 2A) — the
 * single clone + surface-seed + activate path. Every collaborator is injected,
 * so a fake tx client captures the SQL and fake createDraft/seed fns capture the
 * calls. No DB.
 *   npx tsx --test src/lib/studio/install-template.test.ts
 */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installTemplateIntoOrg, type InstallTemplateDeps } from './install-template';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;

interface FakeOpts {
  existing?: boolean;
  /** id returned when resolving the default system template; null → none seeded. */
  defaultTemplateId?: number | null;
  /** is_system for the resolved/explicit template row. */
  isSystem?: boolean;
  /** clone outcome. */
  cloneStatus?: 200 | 404;
  /** node types the cloned definition reads back with. */
  clonedNodeTypes?: string[];
}

function fakes(opts: FakeOpts = {}) {
  const isSystem = opts.isSystem ?? true;
  const cap = {
    createDraftArgs: [] as Array<{ templateId: number; staffId: number | null; name?: string }>,
    seedSurfacesCalls: [] as Array<{ seedCount: number; staffId: number }>,
    buildSeedsNodeTypes: [] as string[][],
    activateCalls: 0,
    queries: [] as string[],
  };

  const client = {
    async query(text: string, _params?: ReadonlyArray<unknown>) {
      cap.queries.push(text);
      if (text.includes('SELECT 1 FROM workflow_definitions')) {
        return { rows: opts.existing ? [{ '?column?': 1 }] : [] };
      }
      if (text.includes('FROM workflow_templates') && text.includes('is_system = true')) {
        return { rows: opts.defaultTemplateId == null ? [] : [{ id: opts.defaultTemplateId, is_system: isSystem }] };
      }
      if (text.includes('SELECT is_system FROM workflow_templates')) {
        return { rows: opts.cloneStatus === 404 ? [] : [{ is_system: isSystem }] };
      }
      if (text.includes('FROM workflow_nodes')) {
        const types = opts.clonedNodeTypes ?? ['receiving'];
        return { rows: types.map((t, i) => ({ id: `n-${i}`, type: t })) };
      }
      if (text.includes('UPDATE workflow_definitions SET is_active = TRUE')) {
        cap.activateCalls += 1;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const deps: InstallTemplateDeps = {
    runTransaction: (_orgId, fn) => fn(client),
    createDraft: (async (a: { templateId: number; staffId: number | null; name?: string }) => {
      cap.createDraftArgs.push({ templateId: a.templateId, staffId: a.staffId, name: a.name });
      return opts.cloneStatus === 404
        ? { status: 404 as const, body: { ok: false as const, error: 'template not found' } }
        : {
            status: 200 as const,
            body: { ok: true as const, id: 99, version: 1 },
            audit: { draftId: 99, templateId: a.templateId, templateSlug: 'electronics-av-refurb', name: a.name ?? 'Electronics', version: 1, nodes: 3, edges: 2 },
          };
    }) as InstallTemplateDeps['createDraft'],
    buildSeeds: ((nodes: Array<{ type: string }>) => {
      cap.buildSeedsNodeTypes.push(nodes.map((n) => n.type));
      // one seed per node — enough to assert plumbing without the real registry.
      return nodes.map((_, i) => ({ surfaceKey: `s${i}`, pageKey: `p${i}`, modeKey: 'm', workflowNodeId: `n-${i}`, label: 'L' }));
    }) as InstallTemplateDeps['buildSeeds'],
    seedSurfaces: (async (_client: unknown, _orgId: unknown, staffId: number, seeds: unknown[]) => {
      cap.seedSurfacesCalls.push({ seedCount: seeds.length, staffId });
      return seeds.length;
    }) as InstallTemplateDeps['seedSurfaces'],
  };

  return { deps, cap };
}

test('skipIfExists no-ops when the org already has a definition', async () => {
  const { deps, cap } = fakes({ existing: true });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 3, activate: 'always', skipIfExists: true }, deps);
  assert.equal(out.status, 200);
  assert.equal(out.seeded, false);
  assert.equal(out.reason, 'org already has a definition');
  assert.equal(cap.createDraftArgs.length, 0);
  assert.equal(cap.activateCalls, 0);
});

test('default resolution + activate:always clones, seeds surfaces, and activates', async () => {
  const { deps, cap } = fakes({ defaultTemplateId: 7, clonedNodeTypes: ['receiving', 'inspection', 'ship'] });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 3, activate: 'always', skipIfExists: true }, deps);
  assert.equal(out.status, 200);
  assert.equal(out.seeded, true);
  assert.equal(out.definitionId, 99);
  assert.equal(out.activated, true);
  assert.equal(out.surfacesSeeded, 3);
  assert.equal(out.templateSlug, 'electronics-av-refurb');
  assert.deepEqual(cap.createDraftArgs, [{ templateId: 7, staffId: 3, name: undefined }]);
  // the node types read back from the clone drive surface seeding.
  assert.deepEqual(cap.buildSeedsNodeTypes, [['receiving', 'inspection', 'ship']]);
  assert.equal(cap.seedSurfacesCalls[0].staffId, 3);
  assert.equal(cap.activateCalls, 1);
});

test('activate:never lands a draft — seeds surfaces but never activates', async () => {
  const { deps, cap } = fakes({ isSystem: true });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 5, templateId: 42, activate: 'never' }, deps);
  assert.equal(out.seeded, true);
  assert.equal(out.activated, false);
  assert.equal(out.surfacesSeeded, 1);
  assert.equal(cap.activateCalls, 0);
  assert.equal(cap.createDraftArgs[0].templateId, 42);
  // explicit id → never looked up the default template.
  assert.ok(!cap.queries.some((q) => q.includes('is_system = true')));
});

test('activate:if_system activates a system template', async () => {
  const { deps, cap } = fakes({ isSystem: true });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 5, templateId: 42, activate: 'if_system' }, deps);
  assert.equal(out.activated, true);
  assert.equal(cap.activateCalls, 1);
});

test('activate:if_system does NOT activate a non-system (custom) template', async () => {
  const { deps, cap } = fakes({ isSystem: false });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 5, templateId: 42, activate: 'if_system' }, deps);
  assert.equal(out.seeded, true);
  assert.equal(out.activated, false);
  assert.equal(cap.activateCalls, 0);
});

test('no system template → 404, nothing cloned', async () => {
  const { deps, cap } = fakes({ defaultTemplateId: null });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: null, activate: 'if_system' }, deps);
  assert.equal(out.status, 404);
  assert.equal(out.seeded, false);
  assert.equal(cap.createDraftArgs.length, 0);
});

test('explicit template id not found → 404', async () => {
  const { deps } = fakes({ cloneStatus: 404 });
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 5, templateId: 999, activate: 'never' }, deps);
  assert.equal(out.status, 404);
  assert.equal(out.reason, 'template not found');
});

test('clone failure surfaces the status, nothing activated', async () => {
  // template row exists (is_system), but createDraft returns 404.
  const { deps, cap } = fakes({ isSystem: true, cloneStatus: 404 });
  // Force the is_system lookup to succeed while the clone fails: give an explicit id.
  const client = {
    async query(text: string) {
      if (text.includes('SELECT is_system FROM workflow_templates')) return { rows: [{ is_system: true }] };
      if (text.includes('SELECT 1 FROM workflow_definitions')) return { rows: [] };
      return { rows: [] };
    },
  };
  deps.runTransaction = ((_o, fn) => fn(client)) as InstallTemplateDeps['runTransaction'];
  const out = await installTemplateIntoOrg({ orgId: ORG, staffId: 5, templateId: 42, activate: 'always' }, deps);
  assert.equal(out.status, 404);
  assert.equal(out.seeded, false);
  assert.equal(out.activated, false);
  assert.equal(cap.activateCalls, 0);
});

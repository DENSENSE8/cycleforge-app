import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlanPath } from './plan-files';

test('accepts every allowed root and returns the path unchanged', () => {
  for (const ok of [
    'docs/receiving-triage-redesign-plan.md',
    'docs/design-system/tokens/README.mdx',
    'master-plan.mdx',
    'AGENTS.md',
    'README.md',
  ]) {
    assert.equal(normalizePlanPath(ok), ok, ok);
  }
});

test('refuses traversal, absolute, backslash and NUL spellings', () => {
  for (const bad of [
    '../secrets.md',
    'docs/../AGENTS.md',
    'docs/../../etc/passwd.md',
    'docs/./plan.md',
    './AGENTS.md',
    '/etc/passwd.md',
    '/home/me/repo/docs/plan.md',
    'C:/repo/docs/plan.md',
    'docs\\plan.md',
    'docs/plan.md\0.png',
    'docs//plan.md',
    'docs/plan.md/',
    '',
  ]) {
    assert.equal(normalizePlanPath(bad), null, JSON.stringify(bad));
  }
});

test('refuses anything outside the allowlist, including excluded docs subtrees', () => {
  for (const bad of [
    'docs/archive/old-plan.md',
    'docs/agent-log/2026-09-01.md',
    'docs/openapi/spec.md',
    'src/lib/tasks/plan.md',
    'node_modules/pkg/README.md',
    '.env.md',
    'docs/.hidden/plan.md',
    'other.mdx', // root .mdx is master-plan.mdx only
    'docs/plan.txt',
    'docs/plan.md.ts',
    'package.json',
    'docs',
  ]) {
    assert.equal(normalizePlanPath(bad), null, bad);
  }
});

test('an excluded name deeper than docs/<name>/ is not excluded', () => {
  assert.equal(normalizePlanPath('docs/receiving/archive/plan.md'), 'docs/receiving/archive/plan.md');
});

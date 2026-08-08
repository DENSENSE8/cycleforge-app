/**
 * Guard — activation gate is wired into page-guard + root layout (H1 Phase C).
 *
 * Run: `tsx --test src/lib/onboarding/activation-gate.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('activation gate wiring', () => {
  it('requirePermission calls isActivationBlocked and redirects to template', () => {
    const guard = read('src/lib/auth/page-guard.ts');
    assert.match(guard, /isActivationBlocked/);
    assert.match(guard, /ACTIVATION_REDIRECT_HREF/);
  });

  it('root layout gates signed-in users without a workflow', () => {
    const layout = read('src/app/layout.tsx');
    assert.match(layout, /isActivationBlocked/);
    assert.match(layout, /ACTIVATION_REDIRECT_HREF/);
  });

  it('/onboarding index forwards to /onboarding/template', () => {
    const page = read('src/app/onboarding/page.tsx');
    assert.match(page, /redirect\(['"]\/onboarding\/template['"]\)/);
  });
});

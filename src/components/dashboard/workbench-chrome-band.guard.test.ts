/**
 * Source guard: WorkbenchChromeHeader density="band" stays a single-surface
 * 40px face (h-10 + p-0.5 inset, flat TabSwitch rail — no nested border/shadow
 * card). TabSwitch size="sm" uses concentric nestedCorner + nav caption type.
 * Cascade: Unbox + Triage on band; Incoming stays default hug.
 *
 * Run: node --test --import tsx \
 *        src/components/dashboard/workbench-chrome-band.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('WorkbenchChromeHeader density="band"', () => {
  const shell = code(src('src/components/dashboard/workbench-shell.tsx'));

  it('outer face is h-10 with 2px inset (p-0.5)', () => {
    assert.match(shell, /band\s*\?\s*'h-10 items-stretch p-0\.5'/);
  });

  it('band rail is flat — no nested border / shadow-sm card', () => {
    // Isolate the band branch of railClassName.
    const bandRail = shell.match(
      /band\s*\?\s*`([^`]+)`\s*:\s*'rounded-full border border-border-default/,
    )?.[1];
    assert.ok(bandRail, 'expected band railClassName template literal');
    assert.match(bandRail, /\bborder-0\b/);
    assert.match(bandRail, /\bshadow-none\b/);
    assert.doesNotMatch(bandRail, /\bborder-border-/);
    assert.doesNotMatch(bandRail, /\bshadow-sm\b/);
  });
});

describe('TabSwitch size="sm" (band companion)', () => {
  const tabSwitch = code(src('src/design-system/components/TabSwitch.tsx'));

  it('compact pill uses nestedCornerClass(card, 0.5)', () => {
    assert.match(tabSwitch, /nestedCornerClass\('card',\s*0\.5\)/);
    assert.doesNotMatch(
      tabSwitch,
      /compact\s*\?\s*cornerClass\('card'\)/,
      'compact must not reuse the outer card radius (flush equal-radius anti-pattern)',
    );
  });

  it('compact solid-hug uses text-role-caption (not text-xs)', () => {
    assert.match(
      tabSwitch,
      /flex h-full items-center px-2\.5 text-role-caption/,
    );
    assert.doesNotMatch(
      tabSwitch,
      /flex h-full items-center px-2\.5 text-xs/,
    );
  });
});

describe('band cascade consumers', () => {
  it('Unbox uses density="band" without leading tab icons', () => {
    const unbox = code(src('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx'));
    assert.match(unbox, /density=["']band["']/);
    assert.doesNotMatch(unbox, /\bUNBOX_TAB_ICON\b/);
    assert.doesNotMatch(unbox, /\bicon:\s*UNBOX_TAB_ICON/);
  });

  it('Triage uses density="band"', () => {
    const triage = code(
      src('src/components/receiving/triage/TriageWorkspaceHeader.tsx'),
    );
    assert.match(triage, /density=["']band["']/);
  });

  it('Incoming stays default hug (no density="band")', () => {
    const incoming = code(
      src('src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx'),
    );
    assert.doesNotMatch(incoming, /density=["']band["']/);
  });
});

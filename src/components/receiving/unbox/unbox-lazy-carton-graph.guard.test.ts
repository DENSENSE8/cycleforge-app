/**
 * Unbox speed Phase 2 — the carton instrument graph is LAZY off browse.
 *
 * Bare `/unbox` browse (the route's declared LCP surface) must never statically
 * import the ~1.1k-LOC `LineEditPanel` + Displays wiring. Two co-mounted siblings
 * under `ReceivingRightPane` can pull it — `UnboxLineWorkspace` AND
 * `TriageLineWorkspace` — so BOTH `next/dynamic`-split `ReceivingLineWorkspace`
 * (shared chunk) and mount it only when a carton is open. `UnboxWorkspaceView`
 * (the browse sheet) must stay free of the carton graph entirely. If EITHER
 * sibling reverts to a static import, `LineEditPanel` re-enters the browse bundle
 * even when the other stays lazy — hence both are asserted.
 *
 * Run: `npx tsx --test src/components/receiving/unbox/unbox-lazy-carton-graph.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Unbox lazy carton graph (Phase 2)', () => {
  it('UnboxLineWorkspace loads ReceivingLineWorkspace via next/dynamic — never a static import', () => {
    const src = read('src/components/receiving/unbox/UnboxLineWorkspace.tsx');
    // No static ESM import of the carton workspace or the panel it carries.
    assert.doesNotMatch(
      src,
      /import\s*\{[^}]*ReceivingLineWorkspace[^}]*\}\s*from/,
      'ReceivingLineWorkspace must be dynamic, not a static import',
    );
    assert.doesNotMatch(
      src,
      /import\s*\{[^}]*\bLineEditPanel\b[^}]*\}\s*from/,
      'LineEditPanel must never be statically imported on the browse path',
    );
    // It IS loaded — lazily — and gated on carton presence.
    assert.match(src, /dynamic\(/, 'must use next/dynamic for the carton overlay');
    assert.match(
      src,
      /import\(\s*['"]@\/components\/receiving\/workspace\/ReceivingLineWorkspace['"]\s*\)/,
      'dynamic import must target ReceivingLineWorkspace',
    );
    assert.match(
      src,
      /ssr:\s*false/,
      'carton graph stays out of the browse server tree',
    );
    // Loading fallback is the geometry skeleton (restore/deep-link), not a
    // pulse-bar LCP on browse.
    assert.match(src, /loading:\s*\(\)\s*=>\s*<ReceivingWorkspaceSkeleton/);
  });

  it('TriageLineWorkspace (co-mounted sibling) also loads it via next/dynamic', () => {
    const src = read('src/components/receiving/triage/TriageLineWorkspace.tsx');
    assert.doesNotMatch(
      src,
      /import\s*\{[^}]*ReceivingLineWorkspace[^}]*\}\s*from/,
      'the triage sibling must be dynamic too, or it re-pulls LineEditPanel onto browse',
    );
    assert.doesNotMatch(src, /import\s*\{[^}]*\bLineEditPanel\b[^}]*\}\s*from/);
    assert.match(src, /dynamic\(/);
    assert.match(
      src,
      /import\(\s*['"]@\/components\/receiving\/workspace\/ReceivingLineWorkspace['"]\s*\)/,
    );
    assert.match(src, /ssr:\s*false/);
  });

  it('ReceivingRightPane statically imports the two workspace shells (they gate the split, not the pane)', () => {
    // The shell may import the shells; the split lives INSIDE each shell. This
    // documents that the pane is allowed to pull both — the carton graph stays
    // out because both shells split it.
    const src = read('src/components/receiving/ReceivingRightPane.tsx');
    assert.match(src, /UnboxLineWorkspace/);
    assert.match(src, /TriageLineWorkspace/);
    assert.doesNotMatch(src, /\bLineEditPanel\b/);
  });

  it('UnboxWorkspaceView (browse sheet) never imports the carton graph', () => {
    const src = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.doesNotMatch(src, /\bReceivingLineWorkspace\b/);
    assert.doesNotMatch(src, /\bLineEditPanel\b/);
  });

  it('the carton chunk still statically wires its own panel (lazy chunk, not lazy panel)', () => {
    // ReceivingLineWorkspace is the split point; inside the chunk the panel
    // stays a plain import so the carton mounts in one paint once fetched.
    const src = read('src/components/receiving/workspace/ReceivingLineWorkspace.tsx');
    assert.match(src, /import\s*\{[^}]*\bLineEditPanel\b[^}]*\}\s*from/);
  });
});

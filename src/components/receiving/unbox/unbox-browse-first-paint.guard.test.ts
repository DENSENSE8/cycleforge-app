/**
 * Unbox Queue SSR first-paint stand-in — To-ship OrdersQueueFirstPaint mirror.
 *
 * Phase 1 speed: empty seed is hard text (never animate-pulse); WorkspaceView
 * statically imports ReceivingLinesTable; opacity handoff kept (To-ship parity).
 *
 * Run: `npx tsx --test src/components/receiving/unbox/unbox-browse-first-paint.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('UnboxBrowseFirstPaint SSR stand-in', () => {
  it('is RSC-safe (no use client) and owns unbox:primary paint surface', () => {
    const src = read('src/components/receiving/unbox/UnboxBrowseFirstPaint.tsx');
    assert.doesNotMatch(src, /^['"]use client['"]/m);
    assert.match(src, /data-paint-surface=["']unbox:primary["']/);
  });

  it('empty seed is hard text — never animate-pulse skeleton bars', () => {
    const src = read('src/components/receiving/unbox/UnboxBrowseFirstPaint.tsx');
    // Ban the Tailwind class in markup — comments may mention the ban by name.
    assert.doesNotMatch(src, /['"`][^'"`]*animate-pulse/);
    assert.doesNotMatch(src, /Array\.from\(\{\s*length:\s*12\s*\}/);
    assert.match(src, /UNBOX_BROWSE_FIRST_PAINT_EMPTY/);
    assert.match(src, /Queue empty — scan Ticket · Tracking · PO/);
  });

  it('shell opacity-handoffs via onPrimaryPainted (To-ship parity — keep)', () => {
    const shell = read('src/components/receiving/unbox/UnboxBrowseShell.tsx');
    assert.match(shell, /['"]use client['"]/);
    assert.match(shell, /opacity-0/);
    assert.match(shell, /onPrimaryPainted/);
    assert.match(shell, /UnboxBrowseFirstPaint/);
  });

  it('page dual-mounts stand-in (sr-only + shell)', () => {
    const page = read('src/app/unbox/page.tsx');
    assert.match(page, /sr-only/);
    assert.match(page, /UnboxBrowseShell/);
    assert.match(page, /seedUnboxQueue/);
  });

  it('UnboxWorkspaceView statically imports ReceivingLinesTable (no dynamic loading flash)', () => {
    const view = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.match(
      view,
      /import ReceivingLinesTable from ['"]@\/components\/station\/ReceivingLinesTable['"]/,
    );
    assert.doesNotMatch(
      view,
      /dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]@\/components\/station\/ReceivingLinesTable['"]/,
    );
  });

  it('UnboxWorkbenchSkeleton is flush — no soft-radius chip classes', () => {
    const src = read('src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx');
    assert.doesNotMatch(src, /rounded-lg/);
    assert.doesNotMatch(src, /rounded-full/);
    assert.doesNotMatch(src, /shadow-sm/);
    assert.match(src, /cornerClass\(['"]flush['"]\)/);
  });
});

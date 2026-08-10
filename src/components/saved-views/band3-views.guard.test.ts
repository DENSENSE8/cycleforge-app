/**
 * Source guard: ops-queue **Views** live on Band 3 trailing find.
 *
 * Saved views are an inner refinement (named URL facet combo), not an outer
 * scope peer of lifecycle tabs. Trigger = flush Lucide Bookmark icon (house
 * `Bookmark` glyph), not Band-1 Star text.
 *
 * Run: node --test --import tsx src/components/saved-views/band3-views.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function code(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('Band-3 saved views placement', () => {
  it('WorkbenchTriageBand exposes a views slot in the right control cluster', () => {
    const shell = code('src/components/dashboard/workbench-shell.tsx');
    const triage = shell.slice(shell.indexOf('export function WorkbenchTriageBand'));
    assert.match(triage, /views\?:/);
    // Honest absence: optional prop always mounts; null/undefined renders nothing.
    assert.match(triage, /\{views\}/);
    assert.match(triage, /kpiToggle/);
  });

  it('WorkbenchViewsMenu is a flush Bookmark icon control (not labeled Views / Star)', () => {
    const menu = code('src/components/saved-views/WorkbenchViewsMenu.tsx');
    assert.match(menu, /Bookmark/);
    // Band-3 peer of KPI / inspector — IconButton xs (icon box), never
    // ToolbarButton h-8 full-band wash on PRIMARY_CHROME_ROW_FACE (h-7).
    assert.match(menu, /IconButton/);
    assert.match(menu, /size="xs"/);
    assert.doesNotMatch(menu, /ToolbarButton/);
    assert.match(menu, /activeView/);
    assert.doesNotMatch(menu, /ChevronDown/);
    assert.doesNotMatch(menu, /\bStar\b/);
  });

  it('useSavedViews exposes org-share (isShared) on the client model', () => {
    const hook = code('src/hooks/useSavedViews.ts');
    assert.match(hook, /isShared/);
    assert.match(hook, /setViewShared/);
    assert.match(hook, /isMine/);
  });
});

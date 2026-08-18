/**
 * Workbench contract guard: collection map stays mounted on selection.
 *
 * - service-workspace hosts compose `ServiceWorkspaceShell` (list keep-alive).
 * - Hybrid Station hosts keep the table via `display:none` (ReceivingRightPane).
 * - Forbid the Support XOR pattern: early-return board OR focus without shell.
 *
 * Law: `.claude/rules/display/workbench.md` → Selection lifecycle / Multi-region;
 * `workbench-service.md` → list stays mounted.
 *
 * Run: node --test --import tsx src/lib/stations/workbench-collection-map.guard.test.ts
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

describe('Workbench collection-map keep-alive', () => {
  it('SupportTicketsWorkspace composes ServiceWorkspaceShell with list always passed', () => {
    const body = code(src('src/components/support/zendesk/SupportTicketsWorkspace.tsx'));
    assert.match(body, /ServiceWorkspaceShell/);
    assert.match(body, /list=\{/);
    // Must not XOR: return board alone OR focus alone as the only child.
    assert.doesNotMatch(
      body,
      /if\s*\(\s*!ticketId\s*\)\s*\{?\s*return\s+<\s*SupportTicketsBoard/,
    );
  });

  it('ServiceWorkspaceShell never unmounts list (display:none / inert hide)', () => {
    const shell = code(src('src/components/support/service-workspace/ServiceWorkspaceShell.tsx'));
    assert.match(shell, /listHidden/);
    assert.match(shell, /display:\s*listHidden\s*\?\s*['"]none['"]/);
    assert.doesNotMatch(shell, /\{listHidden\s*\?\s*null\s*:\s*list\}/);
  });

  it('ReceivingRightPane keeps ReceivingLinesTable mounted via display style', () => {
    const pane = code(src('src/components/receiving/ReceivingRightPane.tsx'));
    assert.match(pane, /ReceivingLinesTable/);
    assert.match(pane, /display:\s*showTable\s*\?\s*['"]block['"]\s*:\s*['"]none['"]/);
  });
});

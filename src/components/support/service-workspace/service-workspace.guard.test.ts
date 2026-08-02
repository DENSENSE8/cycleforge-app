/**
 * Guard — Support is Workbench branch `service-workspace`.
 *
 *   node --import tsx --test src/components/support/service-workspace/service-workspace.guard.test.ts
 *
 * Law: `.claude/rules/display/workbench-service.md`.
 * Ruling: `docs/todo/support-service-workspace-PLAN.md` (2026-08-01).
 *
 * Two things this pins that prose could not. The registry archetype has already
 * been wrong once — it read `'station'` for months because Support was promoted
 * into the Stations *spine section*, and nothing failed. And the ticket focus
 * pane really did mount Unbox carton-bench chrome, which is how the "ticket ≠
 * carton" identity fork came to be allowlisted rather than questioned.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src');

/**
 * Read a file with comments stripped.
 *
 * These files deliberately DOCUMENT the chrome they no longer mount ("it wore
 * `StationWorkbench` until 2026-08-01"), and that history is the most useful
 * thing in them — it is what stops the next agent re-porting carton chrome onto
 * Support. A raw `includes()` cannot tell a mount from a docblock, so it would
 * force the comments out and quietly trade the rationale for the assertion.
 * Scan code only.
 */
function readCode(relPath: string): string {
  return readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Support's primary shell — every file the Tickets surface renders through. */
const SUPPORT_PRIMARY_SHELL = [
  'components/support/zendesk/SupportTicketsWorkspace.tsx',
  'components/support/service-workspace/SupportTicketFocus.tsx',
  'components/support/service-workspace/ServiceWorkspaceShell.tsx',
] as const;

/**
 * Unbox-family carton-bench chrome (`display/station-workbench.md`). The dock is
 * deliberately NOT here: `StationTerminalDock` is a docked action bar, not the
 * region shell, and the branch ruling was about the shell.
 */
const STATION_SHELL_CHROME = [
  'StationWorkbench',
  'StationPanelRoot',
  'StationContextBar',
  'StationMoreDetails',
  'StationAmbientWash',
  'CartonContextCard',
] as const;

test('Support primary shell mounts no Station carton-bench chrome', () => {
  for (const relPath of SUPPORT_PRIMARY_SHELL) {
    const src = readCode(relPath);
    for (const chrome of STATION_SHELL_CHROME) {
      assert.equal(
        src.includes(chrome),
        false,
        `${relPath}: mounts ${chrome} — that is Unbox-family Station anatomy for a transient carton. ` +
          'Support is Workbench branch `service-workspace`; compose PaneHeader + the branch shell instead.',
      );
    }
  }
});

test('the ticket thread does not own its own crossfade — the shell does', () => {
  // Two AnimatePresence over one selection is how a surface ends up playing
  // exit → empty → enter on a record step. The shell keys the swap on ticket id.
  const focus = readCode('components/support/service-workspace/SupportTicketFocus.tsx');
  assert.equal(
    focus.includes('AnimatePresence'),
    false,
    'SupportTicketFocus must not mount its own AnimatePresence — ServiceWorkspaceShell owns the thread crossfade.',
  );
});

test('the shell never unmounts the queue map', () => {
  // THE defect the branch exists to fix: SupportTicketsWorkspace used to return
  // the board OR the focus, so opening a ticket threw away the queue's scroll
  // position, page, and in-flight search.
  const shell = readCode('components/support/service-workspace/ServiceWorkspaceShell.tsx');
  assert.ok(
    /display:\s*listHidden\s*\?\s*'none'/.test(shell),
    'the list pane must be hidden with display:none, never conditionally unmounted',
  );
  assert.equal(
    /\{\s*list\s*!=\s*null/.test(shell) || /list\s*\?\s*\(/.test(shell),
    false,
    'the shell must render `list` unconditionally — a conditional mount is an unmount',
  );

  const workspace = readCode('components/support/zendesk/SupportTicketsWorkspace.tsx');
  assert.ok(
    workspace.includes('ServiceWorkspaceShell'),
    'SupportTicketsWorkspace must mount the branch shell',
  );
  assert.equal(
    /if\s*\(!ticketId\)\s*\{?\s*return/.test(workspace),
    false,
    'SupportTicketsWorkspace must not early-return the board — that is the list/thread swap the shell replaced',
  );
});

test('Support declares the workbench archetype and the service-workspace branch', async () => {
  const { SURFACE_REGISTRY } = await import('@/lib/stations/surface-keys');
  assert.equal(SURFACE_REGISTRY.support.archetype, 'workbench');
  assert.equal(SURFACE_REGISTRY.support.scan, null);
});

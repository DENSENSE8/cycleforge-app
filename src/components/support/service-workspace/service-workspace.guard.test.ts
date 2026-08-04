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

test('the shell owns TWO slots — the right edge belongs to RightRailHost', () => {
  // The shell shipped a private `<aside className={SERVICE_WORKSPACE_CONTEXT_CLASS}>`
  // for one day (2026-08-01): a second permanent consumer of the right edge —
  // which `lib/right-rail/store.ts` exists specifically to prevent — and a
  // duplicate of `SupportContextDetailPanel`, which was already registering the
  // same `SupportContextHub` through the house rail. It was deleted, not migrated.
  const shell = readCode('components/support/service-workspace/ServiceWorkspaceShell.tsx');
  assert.equal(
    /<aside/.test(shell),
    false,
    'ServiceWorkspaceShell must not render its own <aside> — ticket context is a RightRailHost occupant',
  );
  assert.equal(
    shell.includes('SERVICE_WORKSPACE_CONTEXT_CLASS'),
    false,
    'a context-column geometry token is how a second right edge grows back; the rail host owns the width',
  );

  const layout = readCode('components/support/service-workspace/service-workspace-layout.ts');
  assert.equal(
    layout.includes('SERVICE_WORKSPACE_CONTEXT_CLASS'),
    false,
    'service-workspace-layout must not re-export a context-column token',
  );

  // Nothing under the branch may claim the edge directly either.
  for (const relPath of SUPPORT_PRIMARY_SHELL) {
    const src = readCode(relPath);
    assert.equal(
      /fixed\s+(?:inset-y-0\s+)?right-0/.test(src),
      false,
      `${relPath}: hand-rolls a fixed right-edge element — register with RightRailHost instead`,
    );
  }
});

test('ticket context reaches the edge through the house rail, and pushes', () => {
  const workspace = readCode('components/support/zendesk/SupportTicketsWorkspace.tsx');
  assert.ok(
    workspace.includes('SupportContextDetailPanel'),
    'SupportTicketsWorkspace must mount the rail occupant for the open ticket',
  );
  // `push` is required on that panel precisely because its two hosts disagree;
  // /support is the one that owns the edge outright.
  assert.equal(
    /push=\{false\}/.test(workspace),
    false,
    'the /support host must let the context PUSH — the thread reflows beside it, never under it',
  );
});

test('the thread header is the split header, not a full-bleed band', () => {
  // `PaneHeader`'s shell is `mainStickyHeaderClass` — squared and full-bleed,
  // which seams against the rounded queue card the thread replaces. The split
  // header composes the same BLOCKS onto a card shell instead.
  const header = readCode('components/support/service-workspace/SupportTicketPaneHeader.tsx');
  for (const block of ['PaneHeaderActionBar', 'PaneHeaderCloseButton', 'Panel'] as const) {
    assert.ok(header.includes(block), `the split header must compose ${block}`);
  }
  assert.equal(
    header.includes('mainStickyHeaderClass'),
    false,
    'the split header must not re-adopt the full-bleed squared band',
  );

  const focus = readCode('components/support/service-workspace/SupportTicketFocus.tsx');
  assert.ok(
    focus.includes('SupportTicketPaneHeader'),
    'the thread must mount the split header',
  );
  assert.equal(
    /<PaneHeader\b/.test(focus),
    false,
    'the thread must not mount the bare PaneHeader shell — that is the squared band that was removed',
  );
});

test('the displays live on the right edge, not in the middle', () => {
  // The thread mounted a `SectionTabsSlider` (Ticket | Conversations | Timeline)
  // in its own body until 2026-08-02, so reading the linkage or the history
  // swapped the conversation off screen — on the surface whose whole job is that
  // conversation. Displays moved to the rail (the Unbox Displays shape); the
  // middle holds the work and one dock that never re-labels.
  const focus = readCode('components/support/service-workspace/SupportTicketFocus.tsx');
  assert.equal(
    focus.includes('SectionTabsSlider'),
    false,
    'the thread must not mount a display switcher — displays belong to the right rail',
  );
  assert.ok(
    focus.includes('SupportTicketDetail'),
    'the thread must mount the customer conversation directly',
  );
  assert.ok(
    /tabId:\s*'ticket'/.test(focus),
    'the dock is ticket-terminal — it must not resolve from a display selection',
  );

  const workspace = readCode('components/support/zendesk/SupportTicketsWorkspace.tsx');
  assert.ok(
    workspace.includes('useSupportTicketDisplays') && /displays=\{/.test(workspace),
    'the rail occupant must receive the ticket displays',
  );
});

test('Support declares the workbench archetype and the service-workspace branch', async () => {
  const { SURFACE_REGISTRY } = await import('@/lib/stations/surface-keys');
  assert.equal(SURFACE_REGISTRY.support.archetype, 'workbench');
  assert.equal(SURFACE_REGISTRY.support.scan, null);
});

/**
 * ── Phase 4: the vision loop ────────────────────────────────────────────────
 *
 * The trap here is security-shaped and invisible in a screenshot: a cloud model
 * handed `/api/photos/{id}/content` follows a 302 into this app's session gate,
 * fetches a sign-in page, and describes THAT — confidently, to a customer.
 */

test('the client sends photo IDs; only the route resolves an image URL', () => {
  const hook = readCode('hooks/useSupportSuggestion.ts');
  assert.ok(
    hook.includes('stagedPhotoIds'),
    'the drafting request must carry photo IDs',
  );
  assert.equal(
    /photoContentUrl|\/api\/photos\/.*content|imageUrls?\s*:/.test(hook),
    false,
    'the client must never hold or send an image URL — the route resolves a signed one',
  );

  const route = readCode('app/api/support/suggest/route.ts');
  assert.ok(
    route.includes('resolvePhotoAccessUrl'),
    'the route must resolve the signed storage URL itself',
  );
  assert.ok(
    /vision === 'cloud-multimodal'/.test(route),
    'a signed URL may only be resolved on the lane permitted to send one',
  );
});

test('the vision lane is resolved, never assumed', () => {
  const route = readCode('app/api/support/suggest/route.ts');
  assert.ok(
    route.includes('resolveSupportVisionLaneForOrg'),
    'the lane is a per-org safety classification, resolved server-side',
  );

  // A default here would be a silent opt-out at every call site nobody visited
  // (`backend-patterns.md` → a safety classification is a REQUIRED parameter).
  const core = readCode('lib/support/suggest-reply-core.ts');
  assert.ok(
    /vision:\s*SupportVisionLane;/.test(core),
    'the vision lane must be a required parameter with no default',
  );
});

test('the deterministic pass composes the ONE decoder and the ONE search engine', () => {
  const deps = readCode('lib/support/photo-evidence-deps.ts');
  assert.ok(deps.includes('routeScan'), 'decode must go through routeScan');
  assert.ok(deps.includes('hybridSearch'), 'matching must go through hybridSearch');
  assert.ok(
    deps.includes('analyzePhoto'),
    'analysis must use the same writer the upload job uses — never a second one',
  );
});

test('paste has ONE owner on this surface', () => {
  // One gesture, one meaning. If the thread body also caught paste, the same
  // screenshot would "attach quietly" or "attach and draft" depending on where
  // the cursor happened to be.
  const focus = readCode('components/support/service-workspace/SupportTicketFocus.tsx');
  assert.ok(
    /usePhotoDropzone\([^)]*documentPaste:\s*true/s.test(focus),
    'the ticket focus surface owns document-scoped paste',
  );
  const detail = readCode('components/support/zendesk/chat/SupportTicketDetail.tsx');
  assert.ok(
    /usePhotoDropzone\([^)]*paste:\s*false/s.test(detail),
    'the thread body must stand down from paste — the host owns it',
  );
});

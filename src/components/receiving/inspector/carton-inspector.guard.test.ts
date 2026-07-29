/**
 * Hard laws for the carton inspector — the READ view of a carton.
 *
 * Two independent failure modes, and this guard blocks both.
 *
 * ## 1. It grows a write
 *
 * A read view that quietly gains an editable field is worse than no read view:
 * the operator believes they are looking, and the scan-vs-lookup distinction
 * Phase 2 bought is spent. The escape to the bench must stay a LINK.
 *
 * ## 2. It relapses into document calm
 *
 * v1 shipped as a 720px single column with the photos behind a click and was
 * rejected on sight — 25 facts on a 1440px screen, half the viewport empty, on a
 * surface whose job is settling a damage claim. The rebuild's four decisions
 * (Gemini UX review, 2026-07-29) are asserted below in executable form, because
 * each one is a single line someone can "tidy" back to the rejected shape:
 * lifecycle hero (D2), evidence at zero clicks (D3), collapsed provenance (D4),
 * full width (D5).
 *
 * ## What this guard deliberately does NOT assert
 *
 * It no longer requires the inspector to compose the work view's layout panels.
 * That was D4's original condition and D6 overturned it as a category error:
 * sharing the read model, the presentation SoTs and the atoms is what prevents
 * drift; forcing one layout component onto two different jobs produced a read
 * view that was the bench's header with its controls stripped out. Composition
 * is now a choice per primitive — `WorkspaceTimelineTab` is shared because it
 * genuinely fits, and that is not mandated here.
 *
 * Source guard — cheaper than mounting the tree, and it pins the shape rather
 * than the pixels.
 *
 * Run: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/components/receiving/inspector/carton-inspector.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function code(relative: string): string {
  const src = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const INSPECTOR = code('./CartonInspector.tsx');
const MODEL = code('./carton-inspector-model.ts');
const ALL = `${INSPECTOR}\n${MODEL}`;

test('the inspector performs no writes', () => {
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(
      new RegExp(`method:\\s*'${verb}'`).test(ALL),
      false,
      `a ${verb} appeared in the read view — an inspector that writes defeats the lookup distinction`,
    );
  }
  // Mutation plumbing is as disqualifying as a raw fetch.
  for (const smell of ['useMutation', 'emitReceiving', 'dispatchLineUpdated', 'transition(']) {
    assert.equal(ALL.includes(smell), false, `${smell} is a write path`);
  }
});

test('the inspector never mounts the work editor or its terminal', () => {
  // Naming the editors explicitly: the escape to the bench is a LINK, not an
  // embedded editor, so none of these may ever be imported here.
  for (const editor of [
    'LineEditPanel',
    'ReceivingLineWorkspace',
    'UnboxWorkspaceView',
    'StationTerminalDock',
    'StationComposerDock',
    'StationWorkbench',
  ]) {
    assert.equal(
      ALL.includes(editor),
      false,
      `${editor} is a work surface — the inspector must link to /unbox, not embed it`,
    );
  }
  // The escape itself must exist and must go through the route SoT.
  assert.ok(INSPECTOR.includes('openInUnboxHref'), 'the Open in Unbox escape is missing');
});

test('D2 — the surface leads with an answer, not an audit log', () => {
  // The operator scanned a finished box to ask "is this done?". Deriving that
  // in the model and rendering it first is the whole point of the rebuild.
  assert.ok(
    INSPECTOR.includes('cartonLifecycle'),
    'the lifecycle hero is gone — the reader is back to inferring state from timestamp rows',
  );
});

test('D3 — evidence is visible at zero clicks, never behind a launcher', () => {
  assert.ok(
    INSPECTOR.includes('PhotoThumb'),
    'photos must render as tiles on the surface; this is an adjudication view',
  );
  // The v1 failure, by name: a button that opened the gallery elsewhere.
  assert.equal(
    INSPECTOR.includes('View Receiving Photos'),
    false,
    'photos went back behind a launcher — the 7 shots that settle a claim must be on screen',
  );
});

test('D3 — a failed photo load never borrows the "no photos" copy', () => {
  // Found live: the photos endpoint 500d, the query swallowed it into `[]`, and
  // the surface told the reader "No photos were captured for this carton —
  // nothing to support a damage or shortage claim." That is the opposite of the
  // truth, on the one surface where someone may act on it. The queryFn must
  // throw so the errored branch can say which thing happened.
  assert.equal(
    /if \(!res\.ok\) return \{ photos: \[\] \}/.test(INSPECTOR),
    false,
    'the photo query swallows failure into an empty list — an outage then reads as "no evidence exists"',
  );
  assert.ok(
    INSPECTOR.includes('photosError') && INSPECTOR.includes('errored'),
    'the evidence strip must branch errored vs empty, not collapse them',
  );
});

test('D4 — repeated single-actor provenance collapses', () => {
  assert.ok(
    INSPECTOR.includes('collapseProvenance'),
    'four rows repeating one name with second precision is the rejected shape',
  );
});

test('D5 — the read view is full-width, not a station column', () => {
  // 720px is a PROSE constraint inherited from a bench that sits beside a rail.
  // There is no rail here, and line-length limits do not govern dense data.
  for (const cap of ['STATION_WORKBENCH_COLUMN', 'max-w-[720px]', 'max-w-3xl', 'max-w-2xl']) {
    assert.equal(
      INSPECTOR.includes(cap),
      false,
      `${cap} caps the read view back to half a 1440px viewport`,
    );
  }
});

test('a hand-rolled timeline is still a fork', () => {
  // See display/reference-timeline.md — adapt into the shared timeline instead
  // of absolutely-positioning dots down a rule.
  assert.equal(
    /absolute[^\n]*rounded-full[^\n]*bg-/.test(INSPECTOR),
    false,
    'hand-positioned timeline dots — adapt into the shared timeline instead',
  );
});

test('milestone stamps go through the date SoT, never a Date reparse', () => {
  // The API sends warehouse wall-clock strings; `new Date(str)` on those is the
  // banned host-local reparse (source-of-truth.md → Dates).
  assert.ok(INSPECTOR.includes('formatDateTimePST'), 'timestamps must use the date SoT');
  assert.equal(
    /new Date\(/.test(INSPECTOR) || /new Date\(/.test(MODEL),
    false,
    'a Date reparse of a warehouse wall-clock string shifts it by the host offset',
  );
});

test('the read model stays pure — no fetching, no components', () => {
  assert.equal(MODEL.includes('import'), false, 'the model must have no imports at all');
  assert.equal(/fetch\(/.test(MODEL), false, 'the model must not fetch');
});

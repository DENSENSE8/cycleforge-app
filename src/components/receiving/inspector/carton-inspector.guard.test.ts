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
 * ## 2. It relapses into a second photo UI / Unbox CTA spam / lobotomized work chrome
 *
 * Intent pins (not frozen UI names): disposition truth; photos via shared viewer
 * SoT (`usePhotoGallery` + `PhotoViewerPortal`) from a header control — never a
 * page-local EvidenceStage / lightbox; empty ≠ fetch error for photos; single-actor
 * provenance collapse; full width; one quiet `openInUnboxHref` escape (no
 * "Open in Unbox" marketing string). Never require Unbox layout panels /
 * CartonContextCard.
 *
 * Run: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/components/receiving/inspector/carton-inspector.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function collectTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsx(full));
      continue;
    }
    if (/\.(tsx?)$/.test(name) && !name.includes('.test.') && !name.includes('.guard.')) {
      out.push(full);
    }
  }
  return out;
}

const FILES = collectTsx(HERE);
const ALL = FILES.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
const MODEL = stripComments(readFileSync(join(HERE, 'carton-inspector-model.ts'), 'utf8'));

test('the inspector performs no writes', () => {
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(
      new RegExp(`method:\\s*'${verb}'`).test(ALL),
      false,
      `a ${verb} appeared in the read view — an inspector that writes defeats the lookup distinction`,
    );
  }
  for (const smell of ['useMutation', 'emitReceiving', 'dispatchLineUpdated', 'transition(']) {
    assert.equal(ALL.includes(smell), false, `${smell} is a write path`);
  }
});

test('the inspector never mounts the work editor or its terminal', () => {
  for (const editor of [
    'LineEditPanel',
    'ReceivingLineWorkspace',
    'UnboxWorkspaceView',
    'StationTerminalDock',
    'StationComposerDock',
    'StationWorkbench',
    'CartonContextCard',
    'ReceivingDetailsStack',
  ]) {
    assert.equal(
      ALL.includes(editor),
      false,
      `${editor} is a work surface — the inspector must link to /unbox, not embed it`,
    );
  }
  assert.ok(ALL.includes('openInUnboxHref'), 'the quiet work escape (openInUnboxHref) is missing');
});

test('no Open in Unbox marketing spam', () => {
  assert.equal(
    ALL.includes('Open in Unbox'),
    false,
    'findings/header must not repeat "Open in Unbox" — one quiet openInUnboxHref control only',
  );
});

test('disposition truth — exceptions outrank lifecycle.done', () => {
  assert.ok(
    MODEL.includes('cartonDisposition') && MODEL.includes('cartonExceptions'),
    'disposition must be derived in the model so the header cannot claim complete while exceptions hold',
  );
  assert.ok(
    ALL.includes('cartonDisposition'),
    'the surface must render disposition (not raw lifecycle.done alone)',
  );
  assert.equal(
    /Work complete/.test(ALL),
    false,
    'legacy "Work complete" chip must not return — settled only via disposition.settled',
  );
});

test('photos use the shared viewer SoT, never a page-local stage', () => {
  assert.ok(
    ALL.includes('usePhotoGallery') && ALL.includes('PhotoViewerPortal'),
    'photos must open via usePhotoGallery + PhotoViewerPortal (house viewer SoT)',
  );
  assert.equal(
    ALL.includes('EvidenceStage'),
    false,
    'EvidenceStage (large preview + filmstrip) is a second photo UI — delete it',
  );
  assert.equal(
    ALL.includes('View Receiving Photos'),
    false,
    'legacy launcher copy must not return',
  );
  assert.equal(
    /role=["']dialog["']/.test(ALL),
    false,
    'never a local role="dialog" lightbox — mount PhotoViewerPortal instead',
  );
});

test('a failed photo load never borrows the "no photos" copy', () => {
  assert.equal(
    /if \(!res\.ok\) return \{ photos: \[\] \}/.test(ALL),
    false,
    'the photo query swallows failure into an empty list — an outage then reads as "no evidence exists"',
  );
  assert.ok(
    ALL.includes('photosError') || ALL.includes('errored'),
    'the photos control must branch errored vs empty, not collapse them',
  );
});

test('single-actor provenance collapses somewhere in the tree', () => {
  assert.ok(
    ALL.includes('collapseProvenance'),
    'four rows repeating one name with second precision is the rejected shape',
  );
});

test('the read view is full-width, not a station column', () => {
  for (const cap of ['STATION_WORKBENCH_COLUMN', 'max-w-[720px]', 'max-w-3xl', 'max-w-2xl']) {
    assert.equal(
      ALL.includes(cap),
      false,
      `${cap} caps the read view back to half a 1440px viewport`,
    );
  }
});

test('a hand-rolled timeline is still a fork', () => {
  assert.equal(
    /absolute[^\n]*rounded-full[^\n]*bg-/.test(ALL),
    false,
    'hand-positioned timeline dots — adapt into the shared timeline instead',
  );
});

test('milestone stamps go through the date SoT, never a Date reparse', () => {
  assert.ok(ALL.includes('formatDateTimePST'), 'timestamps must use the date SoT');
  assert.equal(
    /new Date\(/.test(ALL) || /new Date\(/.test(MODEL),
    false,
    'a Date reparse of a warehouse wall-clock string shifts it by the host offset',
  );
});

test('the read model stays pure — no fetching, no components', () => {
  assert.equal(MODEL.includes('import'), false, 'the model must have no imports at all');
  assert.equal(/fetch\(/.test(MODEL), false, 'the model must not fetch');
});

test('ban Unbox layout panel composition requirements', () => {
  // Intent: assembly may diverge. Do not resurrect Identity / forced ContextCard.
  assert.equal(
    ALL.includes('CartonInspectorIdentity'),
    false,
    'CartonInspectorIdentity was lobotomized work chrome — do not resurrect',
  );
});

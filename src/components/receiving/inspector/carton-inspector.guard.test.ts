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
 * Intent pins (not frozen UI names): disposition truth; photos via the shared
 * fetch SoT (`useReceivingPhotos`) with drill-in through the shared
 * `PhotoViewerPortal`; never a page-local EvidenceStage / lightbox / receiving-photos
 * query; empty ≠ fetch error for photos; shared carton pipeline
 * (`ReceivingCartonPipeline` + stage rows on a Panel); full width; one quiet
 * `openInUnboxHref` escape (no "Open in Unbox" marketing string). Never require
 * Unbox layout panels / CartonContextCard.
 *
 * The photo mount MOVED (2026-08-01): a mid-rail `ReceivingPhotosSection` card
 * became the DispositionBar-launched `CartonPhotoTriage` panel, so the pins are
 * on the hook and the viewer rather than on that component's name. What did not
 * move — and must not — is that this surface cannot upload, delete, or reassign,
 * and that a failed fetch never renders as "no photos".
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
    'OmnichannelComposerDock',
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

test('photos come from the shared fetch SoT, read-only', () => {
  // Intent pin, not a component name. The mount moved from a mid-rail
  // `ReceivingPhotosSection` card to the DispositionBar-launched triage panel;
  // what must not move is the SHARED query and the read-only contract.
  assert.ok(
    ALL.includes('useReceivingPhotos'),
    'photos must come from the shared carton query hook — never a page-local useQuery against /api/receiving-photos',
  );
  assert.equal(
    /useQuery[\s\S]{0,400}receiving-photos/.test(ALL),
    false,
    'a page-local receiving-photos query is a fourth fork of the shared cache entry',
  );
  assert.ok(
    ALL.includes('readOnly'),
    'the look-up surface must read photos read-only (no upload/delete/reassign)',
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
    ALL.includes('allowReassign'),
    false,
    'read surface must not enable PO photo reassign',
  );
  assert.equal(
    /role=["']dialog["']/.test(ALL),
    false,
    'never a local role="dialog" lightbox — drill-in composes PhotoViewerPortal',
  );
  assert.ok(
    ALL.includes('PhotoViewerPortal'),
    'tile drill-in must compose the shared viewer SoT',
  );
});

test('the read surface can never delete or upload a photo', () => {
  // `usePhotoGallery` arms delete off a numeric `id` on the photo input, and
  // upload off the `receivingId` PROP. Passing either here would hand a look-up
  // surface the power to destroy the evidence it exists to show.
  assert.equal(
    /photos:\s*[\s\S]{0,200}?\bid:\s*(?:row|r|p)\./.test(ALL),
    false,
    'a numeric photo id in the gallery input arms the delete affordance',
  );
  assert.equal(
    /<PhotoGallery[\s\S]{0,400}?receivingId=/.test(ALL),
    false,
    'a receivingId prop on the gallery derives an upload target',
  );
  assert.equal(
    /usePhotoGallery\(\{[\s\S]{0,300}?receivingId/.test(ALL),
    false,
    'a receivingId in the gallery controller derives an upload target',
  );
});

test('a failed photo load never borrows the "no photos" copy', () => {
  assert.equal(
    /if \(!res\.ok\) return \{ photos: \[\] \}/.test(ALL),
    false,
    'the photo query swallows failure into an empty list — an outage then reads as "no evidence exists"',
  );
  // The triage panel must branch on isError with copy of its own; "no photos"
  // and "photos unavailable" are different facts about the world.
  assert.ok(
    ALL.includes('isError'),
    'the photo surface must branch on the error state, not collapse it into empty',
  );
  assert.ok(
    /Photos unavailable/.test(ALL),
    'the error branch needs copy that does not claim the carton has no evidence',
  );
});

test('photo buckets resolve in the model, never in JSX', () => {
  assert.ok(
    ALL.includes('buildCartonPhotoTriage'),
    'lane / bucket / readiness come from the pure triage model',
  );
  for (const smell of ['receiving_package', 'receiving_unbox_carton', 'receiving_item']) {
    assert.equal(
      ALL.includes(smell),
      false,
      `${smell} is a photo_type literal — bucket through the stage SoT instead`,
    );
  }
  assert.equal(
    ALL.includes('damage_detected') || ALL.includes('damageDetected'),
    false,
    'photo_analysis is empty and unwritten — a Damaged bucket keyed on it is a permanently empty tab',
  );
});

test('the Photos CTA is the primary entry, and there is only one', () => {
  // Pinned on the ACCESSIBLE NAMES and the toggle wiring, not on the markup —
  // the first version of this matched a literal `aria-label={...}` and broke the
  // moment the control migrated from a raw <button> to <Button ariaLabel>, which
  // is a DS improvement a guard should never punish.
  for (const name of ['Show photos', 'Hide photos']) {
    assert.ok(ALL.includes(name), `the Photos control must expose the "${name}" accessible name`);
  }
  assert.ok(
    ALL.includes('onTogglePhotos'),
    'the DispositionBar must own the primary Photos toggle',
  );
  assert.equal(
    ALL.includes('ReceivingPhotosSection'),
    false,
    'the mid-rail launcher card is a second front door to one surface — the CTA owns the entry',
  );
});

test('progress uses the shared carton pipeline, not a hand-rolled strip', () => {
  assert.ok(
    ALL.includes('ReceivingCartonPipeline'),
    'carton progress must reuse ReceivingCartonPipeline (stepper + stage detail rows)',
  );
  assert.ok(
    ALL.includes('deriveCartonReadiness'),
    'stepper states must come from deriveCartonReadiness, not ad-hoc timestamps',
  );
  assert.equal(
    ALL.includes('ProvenanceBlock') || ALL.includes('collapseProvenance'),
    false,
    'hand-rolled HANDLING provenance strip is deleted — use the shared stepper',
  );
});

/**
 * The read body is ONE plane (2026-08-05).
 *
 * This assertion replaced `ALL.includes('Panel')`, which pinned the pipeline to
 * a card shell. That pin was written when the alternative was a hand-rolled
 * provenance strip, so "sits on a Panel" was standing in for "is the shared
 * component on a real surface" — and the three assertions above say that
 * directly. Meanwhile the literal check could never fail: `stationIdentityPanelClass`
 * carries the substring `Panel`, so the test passed no matter what the body did.
 *
 * What replaces it is stricter, not looser. Six `Panel radius="xl"` islands on a
 * `surface-canvas` ground had grown into the exact nested-box read the house
 * flush-planes ruling bans (`source-of-truth.md` → Depth elevation): canvas →
 * card → sunken, three surfaces deep, to show one carton's facts. Depth here is
 * the surface STEP between the sunken identity band and the card body; sections
 * separate with hairlines.
 */
test('the read body is one continuous plane, not a stack of cards', () => {
  const PAGE = stripComments(
    readFileSync(join(HERE, 'inspection', 'CartonInspectionPage.tsx'), 'utf8'),
  );
  assert.equal(
    /radius="xl"/.test(PAGE),
    false,
    'a per-section Panel card is back — sections separate with a hairline on one plane',
  );
  assert.equal(
    /rounded-xl border border-border-soft bg-surface-card/.test(PAGE),
    false,
    'hand-rolled card shell — that is the twin the Panel islands were removed to kill',
  );
  assert.ok(
    PAGE.includes('divide-border-hairline'),
    'sections + rows separate with hairlines; without them the flattened plane has no structure',
  );
  assert.equal(
    /gap-5 xl:grid-cols/.test(PAGE),
    false,
    'the two columns are flush with a rule between them — a gutter reads as two floating cards',
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
  // Matches an import STATEMENT (static or dynamic) and `require(`, not the
  // letters. `MODEL.includes('import')` fired on `sourcing_import: 'Sourcing
  // import'` — a source-label map entry, i.e. exactly the pure data this file
  // exists to hold. A guard that fails on its own subject's vocabulary gets
  // muted, so the substring check bought nothing and cost the gate.
  assert.equal(
    /^\s*import\s/m.test(MODEL) || /\bimport\s*\(/.test(MODEL) || /\brequire\s*\(/.test(MODEL),
    false,
    'the model must have no imports at all',
  );
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

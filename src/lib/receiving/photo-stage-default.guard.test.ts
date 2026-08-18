/**
 * Hard law: the receiving photo capture STAGE (`arrival_package` |
 * `unbox_carton` | `unbox_item`) is a safety classification and must never be
 * a defaulted value — see `.claude/rules/backend-patterns.md`.
 *
 * This shipped as a live bug: `photo-scope.ts`'s URL/message parsers defaulted
 * a missing stage to `arrival_package`, and `ReceivingPhotoButton` /
 * `CartonContextCard` / `LineCartonContextSection` each defaulted their
 * `photoStage` prop to the same value. Every call site that forgot to thread
 * a stage — the mobile PO capture page, the Testing bench header, several
 * generic mobile browse/list surfaces — silently stamped bench/unbox photos
 * as dock-arrival evidence, which in turn made the `require_one` photo-policy
 * insurance gate satisfiable by post-opening photos (see
 * `docs/todo/dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md`).
 *
 * Making the three component props required turns a missing prop into a
 * TypeScript compile error — `npx tsc --noEmit` is the guard for that half.
 * What TypeScript CANNOT catch is a wrong string literal default (a fallback
 * that compiles fine but resolves to the wrong stage), so this source guard
 * pins that half: the two module-level fallbacks must resolve to the SAFE
 * stage (`unbox_carton`), and none of the three component declarations may
 * reintroduce a default value for `photoStage`.
 *
 * Source guard — cheaper than mounting every component, and it pins the
 * exact shape a future edit would regress. Mirrors
 * `src/app/api/receiving/lookup-scan-wiring.guard.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so prose about a default can never satisfy the guard. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const PHOTO_SCOPE = code(sourceOf('./photo-scope.ts'));
const RECEIVING_PHOTO_BUTTON = code(
  sourceOf('../../components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx'),
);
const CARTON_CONTEXT_CARD = code(
  sourceOf('../../components/station/entity-context/CartonContextCard.tsx'),
);
const LINE_CARTON_CONTEXT_SECTION = code(
  sourceOf('../../components/receiving/workspace/line-edit/LineCartonContextSection.tsx'),
);

/**
 * Slice from a function's declaration to the START of the next doc comment
 * (`/**`) or `export`, rather than the first `\n}` — several of these
 * functions take an inline object-type parameter (`scope: { ...; }`), whose
 * own closing brace would otherwise end the match early.
 */
function functionBody(src: string, name: string): string {
  const startMatch = new RegExp(`function ${name}\\(`).exec(src);
  assert.ok(startMatch, `${name} not found — did it move or get renamed?`);
  const rest = src.slice(startMatch.index);
  const end = /\n(?:\/\*\*|export )/.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

test('photo-scope: parseReceivingCartonPhotoStage falls back to unbox_carton, never arrival_package', () => {
  const decl = functionBody(PHOTO_SCOPE, 'parseReceivingCartonPhotoStage');
  assert.match(
    decl,
    /return stage \?\? 'unbox_carton';/,
    "the missing-stage fallback must be 'unbox_carton' — a stage-less mobile capture is far more likely to be a bench shot than a door shot",
  );
  assert.equal(
    /return stage \?\? 'arrival_package';/.test(decl),
    false,
    "the unsafe 'arrival_package' fallback must not come back",
  );
});

test('photo-scope: effectiveReceivingPhotoStage falls back to unbox_carton, never arrival_package', () => {
  const decl = functionBody(PHOTO_SCOPE, 'effectiveReceivingPhotoStage');
  assert.match(
    decl,
    /return scope\.stage \?\? 'unbox_carton';/,
    "the missing-stage fallback must be 'unbox_carton'",
  );
  assert.equal(
    /return scope\.stage \?\? 'arrival_package';/.test(decl),
    false,
    "the unsafe 'arrival_package' fallback must not come back",
  );
});

/**
 * Confirms a component's `photoStage` prop is a REQUIRED destructured
 * parameter with no default value (`photoStage,` — not `photoStage = '...'`)
 * and that the corresponding TS type is not optional (`photoStage:` — not
 * `photoStage?:`). Regex-based, matching the source-scan style of the
 * lookup-scan wiring guard rather than a full AST parse.
 */
function assertRequiredNoDefault(src: string, label: string): void {
  assert.match(
    src,
    /photoStage,/,
    `${label}: photoStage must be a bare destructured param with no default (found none matching /photoStage,/)`,
  );
  assert.equal(
    /photoStage\s*=\s*'arrival_package'/.test(src),
    false,
    `${label}: photoStage must not default to 'arrival_package' — that is the exact bug this guard exists to prevent`,
  );
  assert.equal(
    /photoStage\?:/.test(src),
    false,
    `${label}: photoStage must be a required prop (no \`?:\`) so a missing value is a compile error, not a silent default`,
  );
}

test('ReceivingPhotoButton: photoStage is required, no default', () => {
  assertRequiredNoDefault(RECEIVING_PHOTO_BUTTON, 'ReceivingPhotoButton');
});

test('CartonContextCard: photoStage is required, no default', () => {
  assertRequiredNoDefault(CARTON_CONTEXT_CARD, 'CartonContextCard');
});

test('LineCartonContextSection: photoStage is required, no default', () => {
  assertRequiredNoDefault(LINE_CARTON_CONTEXT_SECTION, 'LineCartonContextSection');
});

const PHOTO_REQUEST_PUBLISHER = code(
  sourceOf('../../components/sidebar/receiving/usePhotoRequestPublisher.ts'),
);
const SCAN_APPLY = code(sourceOf('../../components/sidebar/receiving/scan-apply.ts'));
const USE_TRACKING_SCAN = code(
  sourceOf('../../components/sidebar/receiving/useTrackingScan.ts'),
);

test('usePhotoRequestPublisher: stage is a required call-site arg, never hardcoded arrival_package', () => {
  // Regression: Unbox scan auto-push used to stamp stage: 'arrival_package'
  // inside the publisher, so the phone opened Arrival's guided first-photo
  // studio on every Unbox scan. Stage must come from the caller.
  assert.match(
    PHOTO_REQUEST_PUBLISHER,
    /stage:\s*ReceivingPhotoStage/,
    'PhotoRequestPublisher must take an explicit ReceivingPhotoStage parameter',
  );
  assert.equal(
    /stage:\s*'arrival_package'/.test(PHOTO_REQUEST_PUBLISHER),
    false,
    "publisher must not hardcode stage: 'arrival_package' — Unbox scans need unbox_carton",
  );
});

test('scan auto-push call sites: stage from photoStageForScanIntakeSurface', () => {
  for (const [label, src] of [
    ['scan-apply', SCAN_APPLY],
    ['useTrackingScan', USE_TRACKING_SCAN],
  ] as const) {
    assert.match(
      src,
      /photoStageForScanIntakeSurface/,
      `${label}: must derive auto-push stage from intake surface (Unbox → unbox_carton)`,
    );
    assert.match(
      src,
      /publishPhotoRequestFor\([\s\S]*?photoStageForScanIntakeSurface/,
      `${label}: publishPhotoRequestFor must pass photoStageForScanIntakeSurface(...)`,
    );
  }
});

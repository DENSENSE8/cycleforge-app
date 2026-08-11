/**
 * Source guard: the Unbox in-line MOVING OUTLINE (the shared cursor).
 *
 * The dock's `activeKey` (`useUnboxProcedureSteps` — the ONE derivation) stamps
 * `data-active-step` on the controller-active capture row; unlayered globals.css
 * lights the ONE segment / condition it names with a 2px INSET accent outline.
 *
 * Hard laws pinned here (source-of-truth.md → Unbox centre · Active-step outline):
 *  - accent-tokened, never a page-local hex, never `bg-amber-*`
 *  - an OUTLINE, never a `box-shadow` / `ring` / `blur` glow; flush geometry
 *  - INSET (`-2px`) so the flush bar is geometry-identical armed or idle
 *  - instant snap (Gate B) — no transition, so reduced motion is a no-op
 *  - driven by `activeKey`, never a local `useState`; PoLineCaptureRow stays
 *    presentational (it does not derive the procedure itself)
 *
 * Run: node --test --import tsx \
 *   src/components/receiving/workspace/line-edit/active-step-ring.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_STEP_OUTLINE_TARGETS,
  ACTIVE_STEP_RING_CLASS,
} from './active-step-ring';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so documentation prose ("glow", "hex", "box-shadow") never
 *  satisfies a no-glow / no-hex assertion. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const RING_TOKEN = code(sourceOf('./active-step-ring.ts'));
const CAPTURE_ROW = code(sourceOf('./PoLineCaptureRow.tsx'));
const LINE_PO_ITEMS = code(sourceOf('./LinePoItemsSection.tsx'));
const LINE_EDIT = code(sourceOf('../LineEditPanel.tsx'));
const GLOBALS = sourceOf('../../../../styles/globals.css');

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const GLOW = /box-shadow|shadow-[a-z]|\bblur\b|filter\s*:/;

test('ACTIVE_STEP_RING_CLASS is a 2px inset accent outline, flush, no glow', () => {
  assert.match(ACTIVE_STEP_RING_CLASS, /outline-2/);
  assert.match(ACTIVE_STEP_RING_CLASS, /outline-accent-bg/);
  assert.match(ACTIVE_STEP_RING_CLASS, /-outline-offset-2/);
  assert.equal(ACTIVE_STEP_OUTLINE_TARGETS.serial[0], 'serial');
  assert.match(RING_TOKEN, /export const ACTIVE_STEP_RING_CLASS/);
  assert.match(RING_TOKEN, /outline-2/);
  assert.match(RING_TOKEN, /outline-accent-bg/, 'accent from --ds-color-accent-bg, never hex');
  assert.match(RING_TOKEN, /-outline-offset-2/, 'INSET so the flush bar cannot grow / clip');
  assert.match(RING_TOKEN, /cornerClass\('flush'\)/, 'flush geometry');
  assert.doesNotMatch(RING_TOKEN, HEX, 'no page-local hex in the ring token');
  assert.doesNotMatch(RING_TOKEN, /bg-amber-/, 'amber is attention tone, never the cursor');
  assert.doesNotMatch(RING_TOKEN, GLOW, 'a cursor is an outline, never a glow');
  assert.doesNotMatch(RING_TOKEN, /\bring-\d|ring-accent|ring-blue/, 'no box-shadow ring');
});

test('PoLineCaptureRow stamps data-active-step from a prop, never a local store', () => {
  // The attribute rides the same element as data-capture-row so the descendant
  // CSS can reach the segment / condition it names.
  assert.match(
    CAPTURE_ROW,
    /data-capture-row[\s\S]{0,400}data-active-step=\{activeStep \?\? undefined\}/,
    'data-active-step is stamped on the data-capture-row wrapper from activeStep',
  );
  assert.match(
    CAPTURE_ROW,
    /data-capture-condition/,
    'the condition host carries the outline marker',
  );
  // Presentational for the outline: the ONE derivation lives upstream
  // (LineEditPanel). Local openPanel state for in-row Serial is allowed.
  assert.doesNotMatch(
    CAPTURE_ROW,
    /useState[^;]*activeStep|setActiveStep|useUnboxProcedureSteps/,
    'PoLineCaptureRow receives activeStep; it does not re-derive the procedure',
  );
  assert.match(
    CAPTURE_ROW,
    /useState<'serial' \| 'photos' \| null>/,
    'in-row Serial / Photos openPanel is the only local panel UI state',
  );
});

test('the moving outline is gated to the controller-active line', () => {
  assert.match(
    LINE_PO_ITEMS,
    /isControllerLine && dockOwnsCapture \? activeStep : null/,
    'a settled / non-active sibling row never lights (outline-visibility gate, not a mount gate)',
  );
});

test('activeStep sources activeKey from the ONE derivation', () => {
  assert.match(LINE_EDIT, /useUnboxProcedureSteps/, 'the derivation is the source');
  assert.match(
    LINE_EDIT,
    /activeStep: activeKey/,
    'the dock action and the in-line outline read one activeKey — no second store',
  );
});

test('globals.css lights the exact segment / condition, inset accent, instant', () => {
  const block = GLOBALS.match(
    /Unbox capture row — the moving outline[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(block, 'the moving-outline block must be present in globals.css');

  // The four selectors — segment key (photos) and step key (item_photos) both
  // light the Photos segment.
  assert.match(
    block!,
    /\[data-capture-row\]\[data-active-step='serial'\] \[data-capture-segment='serial'\]/,
  );
  assert.match(
    block!,
    /\[data-active-step='photos'\] \[data-capture-segment='photos'\]/,
  );
  assert.match(
    block!,
    /\[data-active-step='item_photos'\] \[data-capture-segment='photos'\]/,
  );
  assert.match(
    block!,
    /\[data-active-step='condition'\] \[data-capture-condition\]/,
  );

  // Assert declarations only (the comment legitimately says "hex" / "glow").
  const decl = block!.match(/\{([^}]*)\}/)?.[1] ?? '';
  assert.match(decl, /outline:\s*2px solid var\(--ds-color-accent-bg\)/, 'accent var, not hex');
  assert.match(decl, /outline-offset:\s*-2px/, 'INSET — zero layout shift');
  assert.doesNotMatch(decl, HEX, 'no page-local hex');
  assert.doesNotMatch(decl, GLOW, 'an outline, never a glow');
  assert.doesNotMatch(decl, /transition/, 'instant hard-cut (Gate B) — reduced motion is a no-op');
});

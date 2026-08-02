/**
 * Hard law: the deck is a TRANSFORM — never a filter, never a sort.
 *
 * Every step it is handed is mounted, from the first frame, in the order it was
 * handed them. That is not a style preference: attempt #1 at this surface
 * (`UnboxCaptureStack`, deleted at `33a3eb609`) hid pending steps and re-sorted
 * completed ones so the current card could sit at the bottom, which made the
 * procedure unreadable as a procedure and needed two extra rules purely to undo
 * its own reordering. `resolveActiveStep` decides the FOCUS; nothing decides
 * membership.
 *
 * ## Why a source guard rather than a render test
 *
 * This repo's unit layer is pure logic + structural guards — there is no React
 * renderer in it, and standing one up for this would be a larger change than the
 * thing being protected. The rendered half is pinned in Playwright
 * (`tests/e2e/unbox-procedure-deck.spec.ts`), which asserts the DOM order and
 * the pile geometry on a real carton. This half catches the same defects at the
 * point they get written, in CI, without a browser.
 *
 * Everything asserted here is a shipped defect or a stated invariant, not a
 * guess at what someone might do.
 *
 * Run: `node --import tsx --test \
 *        src/design-system/components/procedure/procedure-deck-order.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DECK = fileURLToPath(new URL('./ProcedureDeck.tsx', import.meta.url));

const raw = () => readFileSync(DECK, 'utf8');

/** Comments stripped — a docblock swearing off sorting must not satisfy a check. */
const code = () =>
  raw()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

test('the deck maps its steps and does nothing else to the list', () => {
  const src = code();

  assert.match(src, /steps\.map\s*\(/, 'the deck must render from steps.map — that is the transform');

  for (const [name, re] of [
    ['filter', /steps\s*\.\s*filter\s*\(/],
    ['sort', /steps\s*\.\s*sort\s*\(/],
    ['toSorted', /steps\s*\.\s*toSorted\s*\(/],
    ['slice', /steps\s*\.\s*slice\s*\(/],
    ['reverse', /steps\s*\.\s*reverse\s*\(/],
  ] as const) {
    assert.equal(
      re.test(src),
      false,
      `the deck ${name}s its steps. Membership and order belong to the vocabulary ` +
        `(deriveProcedureSteps); the deck only chooses which one is FOCUSED. This is ` +
        `the exact defect that killed UnboxCaptureStack.`,
    );
  }
});

test('a queued card is removed from the flow by MARGIN, never by unmounting it', () => {
  // The pile has to keep the focus card against the composer without dropping
  // the tail. A transform cannot do that — a translated element still occupies
  // its full box — so the pull-up is layout, and every card stays mounted.
  const src = code();
  assert.match(
    src,
    /marginTop/,
    'the queued pull-up is gone — the deck is either unmounting the tail (forbidden) ' +
      'or has grown back into a full column',
  );
});

test('card gaps are per-item margins — `space-y-*` cannot express this layout', () => {
  // Shipped defect: Tailwind v4 compiles `space-y-N` to `margin-block-END` on
  // every child except the last, so the gap belongs to the card ABOVE and a
  // per-item `margin-top` pull-up cannot cancel it. The pile rendered 12px apart
  // instead of tucked while both the computed margin-top and the class list read
  // exactly as intended.
  assert.equal(
    /space-y-/.test(code()),
    false,
    'ProcedureDeck uses a space-y utility. In v4 that is margin-block-end on the ' +
      'preceding sibling, so it survives the queued cards’ negative margin-top and ' +
      'the pile silently un-tucks. Set the gap per item.',
  );
});

test('there is ONE face height, and its two spellings agree', () => {
  // The rem twin is what the pull-up is computed from; the class is what renders.
  // They drifting apart is invisible in review and shows up as a peek that is
  // the wrong height at every root font size but one.
  const src = raw();
  const remDecl = /PROCEDURE_STEP_FACE_REM\s*=\s*([\d.]+)/.exec(src);
  const classDecl = /PROCEDURE_STEP_FACE_HEIGHT\s*=\s*'h-\[([\d.]+)rem\]'/.exec(src);

  assert.ok(remDecl, 'PROCEDURE_STEP_FACE_REM is gone — the pull-up has no basis to compute from');
  assert.ok(classDecl, 'PROCEDURE_STEP_FACE_HEIGHT must stay a rem class, not a px or fixed height');
  assert.equal(
    Number(remDecl![1]),
    Number(classDecl![1]),
    'the face height constants disagree, so the pile tucks by the wrong amount',
  );
});

test('the pile geometry is expressed in rem, never px', () => {
  // The root font size moves with the Settings text-size control. A px pull-up
  // against a rem card is correct at exactly one setting and wrong at every
  // other one — and nobody testing at the default would ever see it.
  const src = code();
  const pull = /marginTop:\s*`([^`]*)`/.exec(src);
  assert.ok(pull, 'the queued pull-up is no longer a template string — re-check the unit');
  assert.match(
    pull![1],
    /rem$/,
    `the queued pull-up ends in "${pull![1]}" rather than rem. Mixing px against a rem ` +
      'card drifts the peek at every text size but the default.',
  );
  assert.match(src, /PROCEDURE_PEEK_REM/, 'the peek unit must come from the named constant');
});

test('exactly one queued card peeks, and the rest sit strictly behind it', () => {
  // Shipped defect: every queued card carried the peek's z-20, so the covered
  // ones — later siblings on the same layer — painted OVER the peek and swallowed
  // every click on its sliver. The deck's only forward affordance was
  // pointer-dead and it looked perfect in a screenshot.
  const src = code();
  const peekZ = /PROCEDURE_PEEK\s*=\s*\{[^}]*z:\s*'z-(\d+)'/.exec(src);
  const coveredZ = /PROCEDURE_COVERED\s*=\s*\{[^}]*z:\s*'z-(\d+)'/.exec(src);

  assert.ok(peekZ && coveredZ, 'the peek/covered layer constants are gone — re-check the pile');
  assert.ok(
    Number(coveredZ![1]) < Number(peekZ![1]),
    `covered cards sit at z-${coveredZ![1]} and the peek at z-${peekZ![1]}. A covered card ` +
      'is a later sibling, so anything but strictly-below paints it over the peek.',
  );
  assert.match(
    src,
    /PROCEDURE_COVERED\s*=\s*\{[^}]*pointer-events-none/,
    'nothing of a covered card is ever on screen, so it must not be able to take a click',
  );
  assert.match(
    src,
    /const\s+isPeek\s*=\s*depth\s*===\s*1/,
    'the peek must be depth 1 exactly — a second visible layer read as a paint failure, ' +
      'double-imaging two queued labels through each other',
  );
});

test('the deck owns no scroll port and no height floor', () => {
  // It is CONTENT inside the station host's port. A nested `flex-1 overflow-y-auto`
  // in a `space-y-*` wrapper has no basis, so it never scrolls, the snap never
  // engages, and a min-height floor renders as an empty white box — all of which
  // shipped here once.
  const src = code();
  for (const [name, re] of [
    ['overflow-y-auto', /overflow-y-auto/],
    ['overflow-hidden', /overflow-hidden/],
    ['min-h-[', /min-h-\[/],
    ['snap-y', /snap-y/],
  ] as const) {
    assert.equal(
      re.test(src),
      false,
      `ProcedureDeck declares ${name}. The station host owns the scroll port, and any ` +
        'clip here shears the overhanging peek and the focus rings inside an expanded body.',
    );
  }
});

test('CSS motion on the deck is motion-safe gated', () => {
  // The app-wide MotionConfig floor covers framer only — it has no visibility
  // into a Tailwind `transition-*`, so an ungated one is vestibular motion that
  // ships straight past reduced-motion.
  const src = code();
  const transitions = [...src.matchAll(/(motion-safe:)?transition-[\w[]/g)];
  assert.ok(transitions.length > 0, 'the pile depth transition is gone — re-check the deck');
  for (const hit of transitions) {
    assert.ok(
      hit[1],
      `"${hit[0]}" is an ungated CSS transition on the deck. \`motion-safe:\` is ` +
        'mandatory here: the app-wide MotionConfig floor covers framer only and cannot ' +
        'see a Tailwind transition.',
    );
  }
});

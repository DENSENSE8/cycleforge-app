import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Capture-stack contract guard.
 *
 * The bottom-anchored stack is the primitive every station migrates onto
 * (`docs/todo/unbox-capture-stack-PLAN.md`). Its behavior lives across TWO
 * files — `CaptureStack.tsx` owns the short-list bottom pin, `useCaptureStack.ts`
 * owns row order + auto-scroll — so a change to either can silently un-anchor
 * the stack with no visual error. These assertions pin the pieces that Phases
 * 2–6 depend on.
 */

const ROOT = process.cwd();
const DIR = 'src/design-system/components/capture-stack';

const read = (rel: string) => readFileSync(join(ROOT, DIR, rel), 'utf8');

test('CaptureStack pins a short list to the bottom with the mt-auto spacer', () => {
  const src = read('CaptureStack.tsx');
  assert.match(
    src,
    /mt-auto/,
    'CaptureStack must keep the mt-auto spacer — scrollTo(bottom) only works once the list overflows, so the spacer is what pins a SHORT list to the bottom',
  );
});

test('CaptureStack does not use flex-col-reverse', () => {
  const src = read('CaptureStack.tsx');
  assert.doesNotMatch(
    src,
    /flex-col-reverse/,
    'Row order and auto-scroll are already solved in useCaptureStackWindow; flex-col-reverse double-solves them and breaks keyboard/scroll a11y (capture-stack PLAN §2.1)',
  );
});

test('CaptureStack expands the last row by default', () => {
  const src = read('CaptureStack.tsx');
  assert.match(
    src,
    /expandLast\s*=\s*true/,
    'expandLast must default to true — the current task is the expanded row directly above the input',
  );
  assert.match(
    src,
    /expandLast && isLast \? 'expanded' : 'collapsed'/,
    'only the last row may render expanded; every completed row collapses to one line',
  );
});

test('useCaptureStackWindow keeps the bottom auto-scroll', () => {
  const src = read('useCaptureStack.ts');
  assert.match(
    src,
    /scrollHeight/,
    'useCaptureStackWindow must scroll the port to scrollHeight so a new row lands in view',
  );
  assert.match(
    src,
    /anchor === 'bottom' \? capped\.reverse\(\) : capped/,
    "the 'bottom' anchor must reverse source order so the newest row sits at the bottom",
  );
});

test('the capture stack honors prefers-reduced-motion', () => {
  for (const rel of ['CaptureStack.tsx', 'CaptureStackRow.tsx']) {
    assert.match(
      read(rel),
      /useReducedMotion/,
      `${rel} must branch on reduced motion (WCAG 2.3.3) — CaptureStack for the layout prop (the bridge has no layout equivalent), CaptureStackRow to suppress the decorative fresh pulse`,
    );
  }
});

test('CaptureStack routes row motion through the reduced-motion bridge', () => {
  const src = read('CaptureStack.tsx');
  for (const hook of ['useMotionPresence', 'useMotionTransition']) {
    // Match a CALL, not a mention. The pre-Phase-2 file carried a
    // `TODO(capture-stack)` docblock naming both hooks verbatim, so a bare
    // /useMotionPresence/ passed on the very code it was meant to reject.
    assert.match(
      src,
      new RegExp(`${hook}\\s*\\(`),
      `CaptureStack must CALL ${hook} — every station that mounts the stack inherits its reduced-motion compliance from here (station-motion-bridge.guard.test.ts)`,
    );
  }
});

test('the capture stack inlines no motion literal — presets live in the SoT', () => {
  for (const rel of ['CaptureStack.tsx', 'CaptureStackRow.tsx']) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /type:\s*'spring'|damping:|stiffness:/,
      `${rel} must not inline a spring — it belongs in framerTransition (motion-framer.ts), or the next consumer forks the timing`,
    );
    assert.doesNotMatch(
      src,
      /duration:\s*[\d.]+/,
      `${rel} must not inline a duration — name it in framerDuration (motion-framer.ts)`,
    );
  }
});

test('the capture stack imports no second animation runtime', () => {
  const banned = /from ['"](gsap|moti|react-spring|@react-spring\/[\w-]+|motion\/react|motion-plus)['"]/;
  for (const file of readdirSync(join(ROOT, DIR))) {
    if (!/\.tsx?$/.test(file) || file.endsWith('.guard.test.ts')) continue;
    assert.doesNotMatch(
      read(file),
      banned,
      `${file} must use framer-motion only — a second runtime fails motion-major.guard.test.ts in CI (build-gotchas.md)`,
    );
  }
});

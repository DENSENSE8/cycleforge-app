/**
 * The kiosk pane frame is STRUCTURAL law, and this pins the two ways it can
 * quietly stop being true.
 *
 * 1. **One header band per pane.** Two chromes stacked on the pickup screen
 *    (2026-09-14) because a pane could paint its own title while the shell was
 *    already painting one. Phase 1 removed the title face from the frame
 *    entirely — `KioskPaneForm` renders a step band or nothing. A pane that
 *    reaches back for `KIOSK_PANE_HEADER_BAND` / `KIOSK_PANE_HEADER_TITLE`, or
 *    re-grows a `hideHeader` prop, has re-opened that door.
 *
 * 2. **The frame is the only frame.** The three panes each had their own copy
 *    of `flex h-full flex-col` → `overflow-y-auto` → footer row, which is how
 *    the repair footer lost its hairline. They must MOUNT the frame, not
 *    re-assemble it.
 *
 * A source-shape test rather than a render test on purpose: this repo has no
 * React test renderer (no @testing-library/react), the invariant is "which
 * component owns the band", and ESLint + the Boundary gate are the only other
 * machines here. Behaviour is proven at runtime on /kiosk/v2.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FRAME = 'src/components/kiosk/KioskPaneForm.tsx';

/** Every center pane that wears the frame. Add a pane here when you add one. */
const PANES = [
  'src/app/kiosk/v2/KioskRepairPane.tsx',
  // Ported 2026-09-15. The cart hand-rolled the whole shape — title band,
  // line count, Void and an X on the RIGHT — which is the build the operator
  // rejected: "displaying without the header and then the X button top left
  // to close the cart and displaying a stepper on the top".
  'src/app/kiosk/v2/KioskCartLedger.tsx',
] as const;

const read = (p: string) => readFileSync(p, 'utf8');

test('every kiosk pane mounts the frame instead of re-assembling one', () => {
  for (const pane of PANES) {
    const src = read(pane);
    assert.match(src, /<KioskPaneForm/, `${pane} does not mount KioskPaneForm`);
    assert.doesNotMatch(
      src,
      /className="flex h-full flex-col"/,
      `${pane} hand-rolls the pane column — that belongs to KioskPaneForm`,
    );
    assert.doesNotMatch(
      src,
      /overflow-y-auto/,
      `${pane} owns its own scroll region — the frame owns scrolling`,
    );
  }
});

/**
 * Every kiosk face below the ONE shell header band. The paperwork sheet and
 * the customer face are not frame panes, but they sit under that same band and
 * each once painted a titled band of its own beneath it (2026-09-23).
 */
const UNDER_THE_BAND = [
  ...PANES,
  'src/app/kiosk/v2/KioskPaperworkPanel.tsx',
  'src/app/kiosk/v2/KioskCustomerFace.tsx',
] as const;

test('no pane can paint a second header band', () => {
  for (const pane of UNDER_THE_BAND) {
    const src = read(pane);
    for (const banned of ['KIOSK_PANE_HEADER_BAND', 'KIOSK_PANE_HEADER_TITLE', 'hideHeader']) {
      assert.doesNotMatch(
        src,
        new RegExp(banned),
        `${pane} reintroduced ${banned} — the double-band bug vector`,
      );
    }
  }
});

test('the frame itself has no title face, and its footer follows the header', () => {
  const src = read(FRAME);
  assert.doesNotMatch(src, /KIOSK_PANE_HEADER_TITLE/);
  // The step band is the only header the frame can render.
  assert.match(src, /<StepProgressHeader/);
  // Footer hairline is derived from `progress`, never a per-pane flag: a step
  // flow floats its key, a shell-titled pane carries the floor band.
  assert.match(src, /!progress && KIOSK_PANE_FOOTER_BAND/);
  assert.doesNotMatch(src, /footerDivider|showFooterBand|hideFooter/);
});

test('the retired command-spine tokens stay retired', () => {
  const chrome = read('src/app/kiosk/kiosk-chrome.ts');
  for (const token of [
    'KIOSK_MODE_SPINE_ROW',
    'KIOSK_MODE_SPINE_ROW_IDLE',
    'KIOSK_MODE_SPINE_ICON',
  ]) {
    assert.doesNotMatch(
      chrome,
      new RegExp(`export const ${token}\\b`),
      `${token} came back — the command spine is gone; trail icons are IconButton + KIOSK_POS_TRAIL_ICON`,
    );
  }
});

/**
 * The cart's own half of the frame law: a step band, satisfied-unit progress,
 * and NO second close control. The X that exits is StepProgressHeader's, top
 * left — the previous build had one on the right of a titled band instead.
 */
test('the cart wears the step band and has no second close control', () => {
  const cart = read('src/app/kiosk/v2/KioskCartLedger.tsx');
  assert.match(cart, /<KioskPaneForm/);
  assert.match(cart, /progress=\{\{/, 'the cart owns a step band, not a titled one');
  assert.doesNotMatch(cart, /kiosk-cart-close/, 'the X is the step band’s, top-left, not a right-side IconButton');
  assert.doesNotMatch(cart, /<IconButton/, 'a second close control is how two chromes came back');
  // PG6: the header count is a gate table, never the step in view.
  assert.match(cart, /cartCompletedSteps\(triage\)/);
  assert.doesNotMatch(cart, /current: step/, 'progress is a COUNT of satisfied units, never a pointer');

  // And the shell must not paint its trail over that band.
  assert.match(
    read('src/app/kiosk/KioskShell.tsx'),
    /utilitySlot !== null && utilitySlot !== 'cart'/,
    'the shell trail would stack a second chrome over the cart step band',
  );
});

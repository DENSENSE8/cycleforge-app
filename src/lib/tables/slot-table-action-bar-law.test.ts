/**
 * THE GATE for "the action bar never changes height".
 *
 * Every assertion here is a cause that actually shipped on the Stock strip and
 * moved the toolbar under the operator's cursor (operator 2026-09-15). The
 * runtime half of the law is `useFixedBandHeight`; this half refuses the three
 * known causes at build time, in a test that reads the real source files rather
 * than a fixture — a law nobody can violate by editing a file the gate does
 * not look at is not a law.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  SLOT_TABLE_ACTION_BAR_BAND_CLASS,
  SLOT_TABLE_ACTION_BAR_BANNED_CLASSES,
  SLOT_TABLE_ACTION_BAR_BANNED_IMPORTS,
  SLOT_TABLE_ACTION_BAR_CONTROL_CLASS,
  SLOT_TABLE_ACTION_BAR_FILES,
  SLOT_TABLE_ACTION_BAR_HEIGHT_CLASS,
  SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
  SLOT_TABLE_ACTION_BAR_HOSTS,
} from './slot-table-action-bar-law';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Strip comments before scanning. Every one of these files DOCUMENTS the banned
 * construct it no longer uses ("it was `flex-wrap … py-2`"), and a gate that
 * cannot tell an explanation from a violation punishes writing the explanation
 * down.
 */
function code(path: string): string {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('slot-table action bar — the band declares its own height', () => {
  it('the band class carries a fixed height, refuses wrapping, and clips overflow', () => {
    // These three together are what make the law structural rather than a
    // convention: with them, no child CAN change the band's height.
    assert.match(SLOT_TABLE_ACTION_BAR_BAND_CLASS, /\bh-10\b/);
    assert.match(SLOT_TABLE_ACTION_BAR_BAND_CLASS, /\bflex-nowrap\b/);
    assert.match(SLOT_TABLE_ACTION_BAR_BAND_CLASS, /\boverflow-hidden\b/);
    // `flex-wrap` was the shipped bug: a wrapped row is a second line.
    assert.doesNotMatch(SLOT_TABLE_ACTION_BAR_BAND_CLASS, /\bflex-wrap\b/);
    // Pad-to-size cannot line up with an h-* scale.
    assert.doesNotMatch(SLOT_TABLE_ACTION_BAR_BAND_CLASS, /\bpy-\d/);
  });

  it('the declared px matches the declared token — the runtime guard asserts the number', () => {
    // `useFixedBandHeight` compares a measured px to SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
    // so a token/px drift would make the guard report a violation on a correct band.
    assert.equal(SLOT_TABLE_ACTION_BAR_HEIGHT_CLASS, 'h-10');
    assert.equal(SLOT_TABLE_ACTION_BAR_HEIGHT_PX, 40);
    assert.equal(SLOT_TABLE_ACTION_BAR_CONTROL_CLASS, 'h-8');
  });

  it('every host mounts the band class and the runtime guard', () => {
    for (const path of SLOT_TABLE_ACTION_BAR_HOSTS) {
      const host = code(path);
      assert.match(host, /SLOT_TABLE_ACTION_BAR_BAND_CLASS/, path);
      assert.match(host, /useFixedBandHeight\(/, path);
      // A guard with no element to observe is decoration.
      assert.match(host, /ref=\{bandRef\}/, path);
    }
  });

  it('no file in the band imports a primitive taller than the control scale', () => {
    for (const file of SLOT_TABLE_ACTION_BAR_FILES) {
      const body = code(file);
      for (const banned of SLOT_TABLE_ACTION_BAR_BANNED_IMPORTS) {
        assert.doesNotMatch(
          body,
          new RegExp(`import\\s*\\{[^}]*\\b${banned.symbol}\\b[^}]*\\}`),
          `${file} imports ${banned.symbol} — ${banned.reason}`,
        );
      }
    }
  });

  it('no file in the band sizes itself from content', () => {
    for (const file of SLOT_TABLE_ACTION_BAR_FILES) {
      const body = code(file);
      for (const banned of SLOT_TABLE_ACTION_BAR_BANNED_CLASSES) {
        assert.ok(
          !body.includes(banned.fragment),
          `${file} uses "${banned.fragment}" — ${banned.reason}`,
        );
      }
    }
  });

  /**
   * The subtlest cause, and the one that produced the operator's report: a
   * control that is only SOMETIMES rendered. `{reason?.requires_note ? <X/> :
   * null}` grew the strip the moment a reason was picked.
   *
   * A conditional on a `<span>` readout is fine — text swaps do not change a
   * fixed-height band. What is refused is a conditionally rendered INPUT or
   * FIELD, because those carry their own box.
   */
  it('mounts no conditional input — a sometimes-field is disabled, never unmounted', () => {
    const conditionalControl =
      /[?&|]{1,2}\s*(?:\n\s*)?<(?:StockStripInput|SearchableSelectField|ReasonCodePicker|input|select|textarea)\b/;
    for (const file of SLOT_TABLE_ACTION_BAR_FILES) {
      const body = code(file);
      assert.doesNotMatch(
        body,
        conditionalControl,
        `${file} renders a control conditionally — mount it and pass disabled instead.`,
      );
    }
  });

  it('the reason picker has no conditional child and no hardcoded title', () => {
    const picker = code('src/components/sku/ReasonCodePicker.tsx');
    // The title was a hardcoded <span>Reason</span> with no prop to suppress it.
    assert.doesNotMatch(picker, /<span[^>]*>\s*Reason\s*<\/span>/);
    // The requires_note line was a conditional <p> INSIDE the control's own
    // <label>, so the control had no fixed height to begin with.
    assert.doesNotMatch(picker, /requires_note\s*&&/);
    // And it sizes on the h-* scale now, not on padding.
    assert.match(picker, /\bh-8\b/);
    assert.ok(!picker.includes('py-1.5'), 'reason picker still pads to size');
  });

  it('every strip text cell is the SHARED one — three copies drift on height', () => {
    // `StockStripInput` is the only text cell in the band; the rows that used
    // to hand-roll their own are what let the qty field be h-11 in one place
    // and h-8 in another.
    for (const file of SLOT_TABLE_ACTION_BAR_FILES) {
      const body = code(file);
      if (!/<input\b/.test(body)) continue;
      assert.ok(
        file.endsWith('stock-verb-row-parts.tsx'),
        `${file} hand-rolls an <input> — use StockStripInput.`,
      );
    }
  });
});

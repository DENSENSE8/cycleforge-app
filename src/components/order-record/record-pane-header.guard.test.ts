/**
 * Pins RecordPaneHeader chrome → context → identity split.
 *
 * Chrome Row 1 uses {@link DeskRailChromeRow} (Unbox twin) — close top-left,
 * cursor + ↑↓ trailing. Contextual icons stay on a separate ActionBar that
 * never receives chrome props.
 *
 * Run: npx tsx --test src/components/order-record/record-pane-header.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('./RecordPaneHeader.tsx', import.meta.url)),
  'utf8',
);

/** Strip comments so doc samples do not satisfy structural asserts. */
function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('RecordPaneHeader chrome / context split', () => {
  it('documents chrome → context → identity and never mixes chrome props onto contextual actions', () => {
    assert.match(src, /chrome ONLY/);
    assert.match(src, /contextual icons/);

    const body = code(src);

    // Chrome Row 1: DeskRailChromeRow owns close · ↑↓ · cursor (never ActionBar).
    assert.match(
      body,
      /DeskRailChromeRow[\s\S]{0,400}?onClose=\{onClose\}/,
      'chrome must mount DeskRailChromeRow with onClose',
    );
    assert.match(
      body,
      /DeskRailChromeRow[\s\S]{0,400}?onPrev=\{onMoveUp\}/,
      'chrome DeskRailChromeRow must wire onPrev to onMoveUp',
    );
    assert.match(
      body,
      /DeskRailChromeRow[\s\S]{0,400}?CursorPositionReadout/,
      'queue counter stays on the chrome row',
    );

    // Contextual ActionBar: actions only — closes immediately (no chrome props).
    assert.match(
      body,
      /actions=\{rowActions\}\s*\/>/,
      'contextual ActionBar must end at actions={rowActions} with no onClose/onPrev/onNext',
    );
    assert.doesNotMatch(
      body,
      /PaneHeaderActionBar[\s\S]{0,200}?onClose=\{onClose\}/,
      'must not mix onClose onto PaneHeaderActionBar — chrome is DeskRailChromeRow',
    );
  });
});

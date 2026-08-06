/**
 * TicketPicker sheet-band / flush lock (2026-08-05).
 *
 * The shared "link an existing ticket" picker (Claim Link · Find, Send photos,
 * shipment link) must share the Claim Subject/Body scanning axis — an underline
 * search face + full-bleed hairline rows — never the old nested-box syndrome:
 * a `rounded-lg` search input inside a `rounded-xl border … bg-surface-card`
 * list shell. Regressing to either put the picker on a second visual language
 * from the compose column it sits in.
 *
 * SoT: DenseComposeFields (DenseComposeSearchInput) +
 * .claude/rules/display/right-rail-inspector.md → Segments.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const PICKER = 'src/components/support/link/TicketPicker.tsx';
const DENSE = 'src/design-system/components/DenseComposeFields.tsx';

describe('TicketPicker flush sheet-band grammar', () => {
  it('composes the DenseCompose flush search face, not a rounded-lg input card', () => {
    const picker = read(PICKER);
    assert.match(
      picker,
      /DenseComposeSearchInput/,
      'search field must use the DenseCompose flush underline face',
    );
    assert.doesNotMatch(
      picker,
      /rounded-lg border/,
      'no rounded-lg bordered search / list box — the column is the card',
    );
  });

  it('uses a full-bleed hairline list, not a rounded-xl bg-surface-card shell', () => {
    const picker = read(PICKER);
    assert.doesNotMatch(
      picker,
      /rounded-xl/,
      'no rounded-xl list-shell box around the results',
    );
    assert.match(
      picker,
      /border-b border-border-hairline/,
      'result rows separate with full-bleed hairlines only',
    );
  });

  it('the flush search face exists on the SoT (grown, not forked)', () => {
    const dense = read(DENSE);
    assert.match(
      dense,
      /export function DenseComposeSearchInput/,
      'DenseComposeSearchInput is the shared search face',
    );
    assert.match(
      dense,
      /border-0 border-b-2/,
      'search face is an underline (border-b-2), not a box',
    );
  });
});

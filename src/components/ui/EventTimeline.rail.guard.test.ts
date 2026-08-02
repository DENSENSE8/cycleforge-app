/**
 * Ratchet: EventTimeline rail must stay mode-glyph + HoverTooltip — never
 * reintroduce tone-colored dots / latest halos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('EventTimeline rail glyphs', () => {
  const src = readSibling('./EventTimeline.tsx');

  it('does not define tone-colored rail dots or halos', () => {
    assert.equal(src.includes('DOT_TONE'), false, 'DOT_TONE must stay deleted');
    assert.equal(src.includes('DOT_HALO'), false, 'DOT_HALO must stay deleted');
    assert.equal(
      /rounded-full[^;]*bg-(blue|emerald|amber|rose)-500/.test(src),
      false,
      'no colored rounded-full rail dots',
    );
  });

  it('resolves glyphs via SoT + HoverTooltip', () => {
    assert.match(src, /resolveTimelineGlyph/);
    assert.match(src, /TIMELINE_GLYPH_ICONS/);
    assert.match(src, /HoverTooltip/);
    assert.match(src, /glyphSpec\.tooltip/);
    assert.match(src, /glyphHref/);
  });

  it('opens timeline media via PhotoViewerPortal, never a new tab', () => {
    assert.match(src, /usePhotoGallery/);
    assert.match(src, /PhotoViewerPortal/);
    assert.match(src, /TimelineMediaStrip/);
    assert.equal(
      /href=\{m\.fullUrl\}/.test(src) || /target="_blank"/.test(src),
      false,
      'timeline thumbs must not open fullUrl in a new tab',
    );
  });
});

describe('EventTimeline station anatomy', () => {
  const src = readSibling('./EventTimeline.tsx');

  it('earns the second line with chips — a chipless row stays one line', () => {
    // The two-line branch must be gated on there being identity chips to hold.
    // Without the gate, a single-unit feed spends half a row of height on a
    // clock: measured on carton 50354 the History panel ran 354px, and 278px
    // with the gate (rows 64/116/116 → 40/90/90).
    assert.match(
      src,
      /const stationTwoLine = stationAnatomy && identityRefs\.length > 0/,
      'stationTwoLine must derive from the presence of identity chips',
    );
    assert.match(src, /\{stationTwoLine \?/, 'the layout branch reads stationTwoLine');
  });

  it('keeps the row-invariant station flags on stationAnatomy, not the layout gate', () => {
    // Day band, latest-row ring and raw-status-trail suppression must not flip
    // per row — one feed would look like two.
    assert.match(src, /isLatest && !stationAnatomy/);
    assert.match(src, /stationAnatomy && isRawStatusTrailSubtitle/);
    assert.match(src, /showDay \? \(/);
  });
});

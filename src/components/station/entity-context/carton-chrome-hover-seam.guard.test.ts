import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * ONE hover box on the carton context header.
 *
 * The bar is a single flush strip (`gap-0`, no `divide-x`), so at rest no cell
 * has edges of its own; the hover seam is the ONLY thing that delineates a cell
 * under the pointer. That makes it the one piece of chrome on the row where
 * "close enough" is immediately visible: the operator sweeps the pointer across
 * eight cells in one gesture and reads the boxes as a set.
 *
 * Two regressions this guard exists to catch:
 *
 * 1. **A per-cell ink.** The seam was briefly `ring-current/30`, which paints
 *    the box blue on Photos, orange on Claim, `text-soft` on the neutral action
 *    cells and `text-default` on the classify pills — four boxes, one strip.
 *    The seam must name ONE fixed ink.
 * 2. **A cell with no box.** The identity chips (order #, tracking #, ticket)
 *    are copy/menu targets that render as centred `inline-flex` chips, so they
 *    acquire neither the box nor the row height unless a host cell gives it to
 *    them. They were the cells that had no hover state at all.
 *
 * Read-only facts stay boxless ON PURPOSE — status dot, qty, price and the
 * Pickup indicator advertise no click, so they must not draw a control box.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const CHROME = 'src/components/station/entity-context/station-identity-chrome.ts';
const CARD = 'src/components/station/entity-context/CartonContextCard.tsx';
const ACTION_PILL =
  'src/components/station/entity-context/station-context-action-pill.ts';
const PILL_PICKER =
  'src/components/receiving/workspace/line-edit/InlinePillPicker.tsx';

test('the hover seam paints one fixed ink, never currentColor', () => {
  const chrome = read(CHROME);
  const seam = /export const STATION_CHROME_CELL_HOVER_SEAM =\s*\n?\s*'([^']+)'/.exec(
    chrome,
  );
  assert.ok(seam, 'STATION_CHROME_CELL_HOVER_SEAM must stay a single string token.');

  const value = seam[1];
  assert.doesNotMatch(
    value,
    /ring-current/,
    'ring-current gives every cell a DIFFERENT coloured box — the exact inconsistency this token removes. Name one ink.',
  );
  assert.match(
    value,
    /hover:ring-inset/,
    'The box must be an inset ring — a border is in the box model and shifts the whole row 1px on hover.',
  );
  assert.match(
    value,
    /hover:ring-text-default\/30/,
    'The box is tuned to the classify pills (text-default/30). Changing the ink changes every cell — do it here, once.',
  );
});

test('the hover fill is a token, not a literal repeated per face', () => {
  const chrome = read(CHROME);
  assert.match(
    chrome,
    /export const STATION_CHROME_CELL_HOVER_FILL = 'hover:bg-surface-hover\/50'/,
    'The neutral hover wash lives in one token so a face cannot drift to its own step.',
  );

  for (const rel of [ACTION_PILL, PILL_PICKER]) {
    assert.doesNotMatch(
      read(rel),
      /hover:bg-surface-hover\/50/,
      `${rel} must compose STATION_CHROME_CELL_HOVER_FILL, not re-spell the wash.`,
    );
  }
});

test('every interactive carton-bar cell composes the seam', () => {
  const actionPill = read(ACTION_PILL);
  // Exit / boxed cube / icon cell / Photos / Claim / Listing. Listing was the
  // face that fell out: it re-spelled the wash literal and drew no box, so it
  // was the one cell on the strip that stayed flat under the pointer. A count
  // of 5 passed the whole time it was missing — hence 6.
  const faces = actionPill.match(/STATION_CHROME_CELL_HOVER_SEAM/g) ?? [];
  assert.ok(
    faces.length >= 6,
    `Every button face on the strip carries the seam; found ${faces.length} of the expected 6+.`,
  );

  const listing =
    /export const STATION_CONTEXT_LISTING_CHROME_CLASS = \[[\s\S]*?\]\.join/.exec(
      actionPill,
    );
  assert.ok(listing, 'Listing face not found — update this guard alongside it.');
  assert.match(
    listing[0],
    /STATION_CHROME_CELL_HOVER_SEAM/,
    'Listing is a click target on the strip; it draws the same box as Photos / Claim.',
  );

  assert.match(
    read(PILL_PICKER),
    /STATION_CHROME_CELL_HOVER_SEAM/,
    'The classify pills are the reference cell — they must draw the same box as the rest.',
  );
});

test('the identity chips get a full-height cell box, the read-only facts do not', () => {
  const chrome = read(CHROME);
  assert.match(
    chrome,
    /export const STATION_CHROME_HOVER_CELL_CLASS = \[\s*\n\s*'flex h-full/,
    'The chip host must be h-full, or its box is shorter than the pills and the strip delineates at two heights.',
  );

  const card = read(CARD);
  const boxed = card.match(/STATION_CHROME_HOVER_CELL_CLASS/g) ?? [];
  assert.ok(
    boxed.length >= 4,
    `Order #, both tracking branches and the ticket chip are interactive and need the box; found ${boxed.length} of 4+.`,
  );

  // The Pickup indicator copies nothing and opens nothing — a box on it would
  // advertise a click that does not exist.
  const pickup = /FulfillmentPickupPill[\s\S]{0,400}?\/>/.exec(card);
  assert.ok(pickup, 'Pickup branch not found — update this guard alongside the tracking slot.');
  const pickupHost = card.slice(Math.max(0, pickup.index - 200), pickup.index);
  assert.doesNotMatch(
    pickupHost,
    /STATION_CHROME_HOVER_CELL_CLASS/,
    'Pickup is a read-only fact; it must not draw an interactive cell box.',
  );
});

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
 * EVERY cell draws the box on hover — including the read-only facts (status
 * dot, qty, price) and the Pickup indicator. This is a deliberate reversal of
 * the earlier "read-only facts stay boxless" rule: the bar must read as one
 * uniform set under a pointer sweep, so a fact cell and a control cell
 * delineate the same way. The base `STATION_CHROME_CELL_CLASS` carries the
 * seam + fill, so composing it is enough — no cell opts out.
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

test('every cell draws the hover box — chips are h-full, read-only facts inherit it', () => {
  const chrome = read(CHROME);
  assert.match(
    chrome,
    /export const STATION_CHROME_HOVER_CELL_CLASS = \[\s*\n\s*'flex h-full/,
    'The chip host must be h-full, or its box is shorter than the pills and the strip delineates at two heights.',
  );

  // The base cell (status dot / qty / price) now carries the SAME box, so the
  // read-only facts delineate identically to the interactive cells.
  const baseCell =
    /export const STATION_CHROME_CELL_CLASS = \[[\s\S]*?\]\.join/.exec(chrome);
  assert.ok(baseCell, 'STATION_CHROME_CELL_CLASS must stay an array-composed token.');
  assert.match(
    baseCell[0],
    /STATION_CHROME_CELL_HOVER_FILL/,
    'the base cell must carry the hover FILL so price / qty / status dot box on hover',
  );
  assert.match(
    baseCell[0],
    /STATION_CHROME_CELL_HOVER_SEAM/,
    'the base cell must carry the hover SEAM so price / qty / status dot box on hover',
  );

  const card = read(CARD);
  const boxed = card.match(/STATION_CHROME_HOVER_CELL_CLASS/g) ?? [];
  assert.ok(
    boxed.length >= 4,
    `Order #, both tracking branches, the ticket chip and the pickup slot need the box; found ${boxed.length} of 4+.`,
  );

  // The Pickup indicator now shares the tracking slot's box, so the slot reads
  // the same whether it holds tracking or a pickup marker.
  const pickup = /FulfillmentPickupPill[\s\S]{0,400}?\/>/.exec(card);
  assert.ok(pickup, 'Pickup branch not found — update this guard alongside the tracking slot.');
  const pickupHost = card.slice(Math.max(0, pickup.index - 200), pickup.index);
  assert.match(
    pickupHost,
    /STATION_CHROME_HOVER_CELL_CLASS/,
    'Pickup shares the tracking slot box so the slot delineates the same either way.',
  );
});

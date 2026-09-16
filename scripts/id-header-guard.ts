/**
 * `Id header` verify gate — column one says `Id`, on every peer.
 *
 * Same rule module as the Unit-tests gate
 * (`src/lib/tables/slot-table-id-header-law.ts`) and as the `ds_id_header` MCP
 * face, so the three can never disagree. It exists as its own `always` gate
 * for the reason `Nav names`, `Mobile-first` and `Action bar` do: it is a
 * source read (<1s), and the increment that breaks it — re-adding `label:
 * identity.label` to a column module, or wording an identity track by hand —
 * is exactly the increment that runs `verify:fast` rather than the full suite.
 *
 * It reads SOURCE. The unit tripwire reads the materialized columns of every
 * peer, which is the stronger check but costs a module graph; this one is the
 * fast half of the pair, not a replacement for it.
 *
 * Operator 2026-09-15: *"the ID as the first column so it'll always display
 * the ID as the first column in the header instead of differences"*.
 */

import { readFileSync } from 'node:fs';
import {
  SLOT_TABLE_ID_HEADER_FILES,
  SLOT_TABLE_ID_HEADER_REFUSAL,
  SLOT_TABLE_ID_HEADER_WORD,
  SLOT_TABLE_IDENTITY_TRACK_KEYS,
  SLOT_TABLE_NO_IDENTITY_TRACK_PEERS,
} from '../src/lib/tables/slot-table-id-header-law';

/** Comments DOCUMENT the banned construct; only real code counts. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const violations: string[] = [];

for (const file of SLOT_TABLE_ID_HEADER_FILES) {
  const src = code(file);
  if (/(label|gridLabel):\s*identity\.label/.test(src)) {
    violations.push(`${file} re-declares the identity header from its catalog (label: identity.label).`);
  }
}

/** The engine's own declaration — if this drifts, every peer drifts with it. */
const skeleton = code('src/components/tables/compound/compound-columns.ts');
const fulfillmentBlock = /key: 'fulfillment',[\s\S]*?\n  \},/.exec(skeleton)?.[0] ?? '';
if (!fulfillmentBlock) {
  violations.push('compound-columns.ts no longer declares a `fulfillment` track.');
} else {
  for (const face of ['label', 'gridLabel']) {
    if (!new RegExp(`${face}: SLOT_TABLE_ID_HEADER_WORD`).test(fulfillmentBlock)) {
      violations.push(
        `compound-columns.ts sets the identity ${face} to a literal. It must read SLOT_TABLE_ID_HEADER_WORD.`,
      );
    }
  }
}

/** The record engine may not word the identity header either. */
const columnEngine = code('src/components/tables/compound/slot-table-columns.ts');
if (!/label: SLOT_TABLE_ID_HEADER_WORD/.test(columnEngine)) {
  violations.push(
    'slot-table-columns.ts no longer paints the identity header from SLOT_TABLE_ID_HEADER_WORD.',
  );
}
const familyType = code('src/lib/tables/slot-table-family.ts');
if (/interface SlotTableIdentityBinding \{[^}]*label/.test(familyType)) {
  violations.push(
    'SlotTableIdentityBinding gained a `label` — that is the deleted per-family override returning as a property.',
  );
}

const asJson = process.argv.includes('--json');

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: violations.length === 0,
        word: SLOT_TABLE_ID_HEADER_WORD,
        identityTrackKeys: SLOT_TABLE_IDENTITY_TRACK_KEYS,
        refusal: SLOT_TABLE_ID_HEADER_REFUSAL,
        columnModules: SLOT_TABLE_ID_HEADER_FILES,
        noIdentityTrackPeers: SLOT_TABLE_NO_IDENTITY_TRACK_PEERS,
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

console.log(
  `id-header-guard: ${SLOT_TABLE_ID_HEADER_FILES.length} column modules, word ` +
    `${JSON.stringify(SLOT_TABLE_ID_HEADER_WORD)} on ${SLOT_TABLE_IDENTITY_TRACK_KEYS.join(' · ')}; ` +
    `${SLOT_TABLE_NO_IDENTITY_TRACK_PEERS.length} sheet peers have no identity track.`,
);

if (violations.length > 0) {
  console.error('\nTHE IDENTITY HEADER IS THE ENGINE\u2019S — src/lib/tables/slot-table-id-header-law.ts\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(`\n  ${SLOT_TABLE_ID_HEADER_REFUSAL}\n`);
  process.exit(1);
}

console.log('column one says Id; no family re-declares it.');

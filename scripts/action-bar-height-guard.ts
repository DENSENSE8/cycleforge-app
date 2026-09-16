/**
 * `Action bar` verify gate — the slot-table action strip may not change height.
 *
 * Same rule module as the Unit-tests gate
 * (`src/lib/tables/slot-table-action-bar-law.ts`), so the two can never
 * disagree. This exists as its own `always` gate for the same reason `Nav
 * names` and `Mobile-first` do: it is a source read (<1s), and the increments
 * that break it — adding a control to the strip, reaching for `TextField`,
 * rendering a field conditionally — are exactly the increments that run
 * `verify:fast` rather than the full suite.
 *
 * Operator 2026-09-15: *"the action buttons bar should not expand or collapse
 * in height from clicking on an action — it should stay the same height."*
 */

import { readFileSync } from 'node:fs';
import {
  SLOT_TABLE_ACTION_BAR_BAND_CLASS,
  SLOT_TABLE_ACTION_BAR_BANNED_CLASSES,
  SLOT_TABLE_ACTION_BAR_BANNED_IMPORTS,
  SLOT_TABLE_ACTION_BAR_FILES,
  SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
  SLOT_TABLE_ACTION_BAR_HOST,
  SLOT_TABLE_ACTION_BAR_LAW,
} from '../src/lib/tables/slot-table-action-bar-law';

/** Comments DOCUMENT the banned constructs; only real code counts. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const violations: string[] = [];

for (const file of SLOT_TABLE_ACTION_BAR_FILES) {
  let body: string;
  try {
    body = code(file);
  } catch {
    violations.push(`${file} — listed in the law but missing from the tree.`);
    continue;
  }

  for (const banned of SLOT_TABLE_ACTION_BAR_BANNED_IMPORTS) {
    if (new RegExp(`import\\s*\\{[^}]*\\b${banned.symbol}\\b[^}]*\\}`).test(body)) {
      violations.push(`${file} imports ${banned.symbol} — ${banned.reason}`);
    }
  }

  for (const banned of SLOT_TABLE_ACTION_BAR_BANNED_CLASSES) {
    if (body.includes(banned.fragment)) {
      violations.push(`${file} uses "${banned.fragment}" — ${banned.reason}`);
    }
  }

  const conditionalControl =
    /[?&|]{1,2}\s*(?:\n\s*)?<(?:StockStripInput|SearchableSelectField|ReasonCodePicker|input|select|textarea)\b/;
  if (conditionalControl.test(body)) {
    violations.push(
      `${file} renders a control conditionally — mount it and pass \`disabled\` instead. ` +
        'A control that appears on a press changes the band height under the cursor.',
    );
  }

  if (/<input\b/.test(body) && !file.endsWith('stock-verb-row-parts.tsx')) {
    violations.push(`${file} hand-rolls an <input> — use StockStripInput.`);
  }
}

const host = code(SLOT_TABLE_ACTION_BAR_HOST);
if (!host.includes('SLOT_TABLE_ACTION_BAR_BAND_CLASS')) {
  violations.push(`${SLOT_TABLE_ACTION_BAR_HOST} does not mount the band class.`);
}
if (!/useFixedBandHeight\(/.test(host)) {
  violations.push(
    `${SLOT_TABLE_ACTION_BAR_HOST} does not mount useFixedBandHeight — the law's runtime half.`,
  );
}

const asJson = process.argv.includes('--json');

if (asJson) {
  // The VERDICT is the payload — `ds_action_bar` prints this straight through,
  // so a failing law reads the same to an agent as it does in the gate log.
  console.log(
    JSON.stringify(
      {
        ok: violations.length === 0,
        law: SLOT_TABLE_ACTION_BAR_LAW.invariant,
        heightPx: SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
        bandClass: SLOT_TABLE_ACTION_BAR_BAND_CLASS,
        controlClass: 'h-8',
        bandFiles: SLOT_TABLE_ACTION_BAR_FILES,
        bannedImports: SLOT_TABLE_ACTION_BAR_BANNED_IMPORTS,
        bannedClasses: SLOT_TABLE_ACTION_BAR_BANNED_CLASSES,
        conditionalControlRule:
          'A sometimes-relevant field is always mounted and `disabled`, never conditionally rendered.',
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

console.log(
  `action-bar-height-guard: ${SLOT_TABLE_ACTION_BAR_FILES.length} band files, ` +
    `height ${SLOT_TABLE_ACTION_BAR_HEIGHT_PX}px (${SLOT_TABLE_ACTION_BAR_BAND_CLASS.split(' ').find((c) => c.startsWith('h-'))}).`,
);

if (violations.length > 0) {
  console.error('\nTHE ACTION BAR MUST NOT CHANGE HEIGHT — src/lib/tables/slot-table-action-bar-law.ts\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error('');
  process.exit(1);
}

console.log('the band declares its own height; no child can move it.');

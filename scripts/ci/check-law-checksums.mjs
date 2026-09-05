#!/usr/bin/env node
/**
 * Law checksum gate.
 *
 * A design law that CI enforces is only as strong as the law file itself: the
 * cheapest way past `check-mobile-display-law.mjs` is to edit the cohort so the
 * violation becomes legal, in the same commit, and let a green build vouch for
 * it. Hashing the law and committing the hash makes that edit VISIBLE — the
 * gate fails until someone updates `docs/eval/law-checksums.json`, which is a
 * reviewable line in the diff that says "the law changed".
 *
 * The repo already works this way elsewhere: `machine-gate.mjs` hashes the
 * repair-law source, and `perf-overnight.mjs` carries law_hash / prev_hash /
 * entry_hash on its ledger entries.
 *
 *   node scripts/ci/check-law-checksums.mjs           # verify
 *   node scripts/ci/check-law-checksums.mjs --update  # re-record, deliberately
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LEDGER = 'docs/eval/law-checksums.json';

/** Law sources whose content is pinned. Add a law → add a line. */
const LAWS = [
  'src/lib/mobile/mobile-display-cohort.ts',
  'src/lib/tables/slot-table-cohort.ts',
  'src/lib/tables/slot-table-session-laws.ts',
  'src/lib/tables/table-engine-law.ts',
  'src/lib/tables/slot-table-line-qty.ts',
  'src/lib/tables/slot-table-line-money.ts',
  'src/lib/tables/slot-table-header-sort.ts',
  'src/lib/keyboard/shortcut-display-cohort.ts',
  'src/lib/station/scan-station-overlay-cohort.ts',
];

const hash = (file) =>
  createHash('sha256').update(readFileSync(file, 'utf8'), 'utf8').digest('hex').slice(0, 16);

const current = Object.fromEntries(LAWS.filter(existsSync).map((f) => [f, hash(f)]));

if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  writeFileSync(
    LEDGER,
    `${JSON.stringify(
      {
        _README:
          'Content hashes of the design-law sources. A changed hash means a LAW changed — review it as law, not as code. Re-record with `node scripts/ci/check-law-checksums.mjs --update`.',
        laws: current,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`✓ recorded ${Object.keys(current).length} law checksums → ${LEDGER}`);
  process.exit(0);
}

if (!existsSync(LEDGER)) {
  console.error(`✖ ${LEDGER} is missing. Record it: node scripts/ci/check-law-checksums.mjs --update`);
  process.exit(1);
}

const recorded = JSON.parse(readFileSync(LEDGER, 'utf8')).laws ?? {};
const drift = Object.entries(current).filter(([file, h]) => recorded[file] !== h);
const removed = Object.keys(recorded).filter((f) => !(f in current));

if (drift.length === 0 && removed.length === 0) {
  console.log(`✓ ${Object.keys(current).length} law checksums match`);
  process.exit(0);
}

console.error('\n✖ design law changed without re-recording its checksum\n');
for (const [file, h] of drift) {
  console.error(`  ${file}`);
  console.error(`    recorded ${recorded[file] ?? '(none)'} → now ${h}\n`);
}
for (const file of removed) console.error(`  ${file} — recorded but no longer present\n`);
console.error(
  'If the law genuinely changed, say so in the diff:\n  node scripts/ci/check-law-checksums.mjs --update\n',
);
process.exit(1);

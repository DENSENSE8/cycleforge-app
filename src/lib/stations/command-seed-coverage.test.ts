import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { listSeedableCommandCodes } from './command-book';
import { NAV_COMMAND_CODES } from './nav-command-codes';
import { ACTION_COMMAND_CODES } from './action-command-codes';
import { STATION_COMMAND_CODES } from './station-command-codes';

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'lib', 'migrations');

/**
 * Admin-catalog coverage.
 *
 * The defect this guards against already happened: `seedOrgCatalog` iterated
 * STATION_COMMAND_CODES alone, which was the whole vocabulary when it was
 * written. Every code later added to the nav or action registry was therefore
 * invisible in Admin for every org — and nothing could notice, because the
 * seeder was not wrong about anything it knew about.
 */
describe('command seed coverage', () => {
  it('the seedable list is every registered code, once', () => {
    const seeded = listSeedableCommandCodes().map((r) => r.code).sort();
    const registered = [
      ...NAV_COMMAND_CODES,
      ...ACTION_COMMAND_CODES,
      ...STATION_COMMAND_CODES,
    ].map((c) => c.code).sort();
    assert.deepEqual(seeded, registered);
  });

  it('sorts coherently within the one flow_context', () => {
    // The three registries each number from 10. Without a per-family offset a
    // jump code and a verdict code interleave arbitrarily in the Admin list.
    const orders = listSeedableCommandCodes().map((r) => r.sortOrder);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    assert.equal(new Set(orders).size, orders.length, 'duplicate sort_order');
  });

  it('every registered code appears in some station_command seed migration', () => {
    // Existing orgs are backfilled by migration; new orgs by the derived
    // seeder. This asserts the FIRST half — a code added to a registry with no
    // seed migration is invisible for every org that already exists, which is
    // every real tenant.
    //
    // Deliberately a union across migrations, not one named file: an applied
    // migration is immutable (the ledger is keyed on sha256), so code #28 gets
    // a NEW migration rather than an edit to this one. Failing here is the
    // prompt to write it.
    const sql = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      .filter((body) => body.includes("'station_command'"))
      .join('\n');

    const missing = listSeedableCommandCodes()
      .map((r) => r.code)
      .filter((code) => !sql.includes(`'${code}'`));

    assert.deepEqual(
      missing,
      [],
      `no station_command seed migration covers: ${missing.join(', ')} — add one so orgs that already exist get the row`,
    );
  });
});

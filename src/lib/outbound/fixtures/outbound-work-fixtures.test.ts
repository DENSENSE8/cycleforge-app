import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { outboundWorkPageSchema } from '../work-contract';

/** The shared outbound-work fixtures (promoted from the SwiftUI lane's CycleForgeClientTests / CycleForgeContractsTests at b7e7653a3) are… */
const DIR = __dirname;
const fixtures = readdirSync(DIR).filter((f) => /^outbound-work-.*\.json$/.test(f));

test('every outbound-work fixture parses under the runtime page contract', () => {
  assert.ok(fixtures.length > 0, 'no outbound-work fixtures found');
  for (const file of fixtures) {
    const parsed = outboundWorkPageSchema.safeParse(JSON.parse(readFileSync(join(DIR, file), 'utf8')));
    assert.ok(parsed.success, `${file}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  }
});

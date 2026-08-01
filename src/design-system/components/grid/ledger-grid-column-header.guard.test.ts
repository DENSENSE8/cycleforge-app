/**
 * Receiving + Incoming + Pickup sticky headers must compose LedgerGridColumnHeader —
 * never re-fork the select-all / sort / frozen / tip recipe.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const ADAPTERS = [
  'src/components/station/receiving-grid/ReceivingGridColumnHeader.tsx',
  'src/components/station/incoming-grid/IncomingGridColumnHeader.tsx',
  'src/components/receiving/pickup/grid/PickupGridColumnHeader.tsx',
] as const;

describe('LedgerGridColumnHeader composition', () => {
  for (const rel of ADAPTERS) {
    it(`${path.basename(rel)} imports LedgerGridColumnHeader`, () => {
      const source = readFileSync(path.join(ROOT, rel), 'utf8');
      assert.match(
        source,
        /LedgerGridColumnHeader/,
        `${rel} must compose LedgerGridColumnHeader (shared sticky header SoT)`,
      );
      assert.doesNotMatch(
        source,
        /role="columnheader"/,
        `${rel} must not re-assert columnheader roles — that lives in LedgerGridColumnHeader`,
      );
    });
  }
});

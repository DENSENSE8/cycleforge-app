/**
 * Sheets orders queue — identity chips must be icon-less on gridSkin.
 * Header already labels Order / Tracking; cell Hash/MapPin is doubled noise.
 *
 *   npx tsx --test src/components/dashboard/orders-queue/orders-queue-plain-identity.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const ROW = join(__dirname, 'OrdersQueueTableRow.tsx');

describe('OrdersQueueTableRow — gridSkin plain identity chips', () => {
  const src = readFileSync(ROW, 'utf8');

  it('passes variant plain when gridSkin (not a permanent icons default)', () => {
    assert.match(
      src,
      /variant:\s*\(gridSkin\s*\?\s*'plain'\s*:\s*'icons'\)/,
      'gridSkin identity cells must use variant plain; mobile keeps icons',
    );
  });

  it('mobile cluster still forces icons', () => {
    assert.match(
      src,
      /OrderIdentityChips\s+\{\.\.\.identityChipProps\}\s+variant="icons"/,
      'mobile OrderIdentityChips cluster must keep the icon family',
    );
  });
});

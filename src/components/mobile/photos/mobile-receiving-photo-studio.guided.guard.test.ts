/**
 * Arrival guided studio — wiring contract.
 *
 * Pure step parse lives in `@/lib/receiving/photo-scope` (tested there). This
 * guard pins the client studio + photos page so guided mode, the
 * arrival-only stage gate, and the two-step aspect order cannot silently drop.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('MobileReceivingPhotoStudio arrival guided contract', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/mobile/photos/MobileReceivingPhotoStudio.tsx'),
    'utf8',
  );
  const pageSrc = readFileSync(
    join(process.cwd(), 'src/app/m/(immersive)/r/[id]/photos/page.tsx'),
    'utf8',
  );

  it('gates guided mode on arrival_package', () => {
    assert.match(src, /arrival_package/);
    assert.match(src, /guidedArrival/);
  });

  it('enqueues shipping_label then box_exterior', () => {
    assert.match(src, /enqueueShots\(shots, 'shipping_label'\)/);
    assert.match(src, /enqueueShots\(shots, 'box_exterior'\)/);
  });

  it('photos page wires guided + step query params', () => {
    assert.match(pageSrc, /guided=\{guided\}/);
    assert.match(pageSrc, /initialStep=\{initialStep\}/);
    assert.match(pageSrc, /searchParams\.get\('guided'\) === '1'/);
  });
});

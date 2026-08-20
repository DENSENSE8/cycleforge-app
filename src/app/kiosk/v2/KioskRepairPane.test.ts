/**
 * Landscape kiosk repair checkout must show every contact field at once.
 * The contact block is now the shared `KioskCustomerIntake` (one intake face
 * across Repair / Retail / Buyback / Pickup); a stepped wizard that pinned one
 * field at a time hid name/phone/email and permanently disabled submit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const PANE = join(process.cwd(), 'src/app/kiosk/v2/KioskRepairPane.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('KioskRepairPane customer fields', () => {
  const src = read(PANE);

  it('composes the shared KioskCustomerIntake (all contact fields at once)', () => {
    assert.match(src, /<KioskCustomerIntake/);
    assert.doesNotMatch(src, /CustomerInfoForm/);
  });

  it('does not pin the stepped wizard to extras', () => {
    assert.doesNotMatch(src, /CONTACT_FIELDS\[CONTACT_FIELDS\.length\s*-\s*1\]/);
    assert.doesNotMatch(src, /activeField=\{CONTACT_FIELDS/);
  });

  it('uses ReasonSelector appearance="pills" (Phase 2 SoT)', () => {
    assert.match(src, /<ReasonSelector[\s\S]*?appearance="pills"/);
  });

  it('puts a back control in the header and an add-another service action', () => {
    assert.match(src, /data-testid="kiosk-repair-back"/);
    assert.match(src, /ariaLabel="Back to catalog"/);
    assert.match(src, /data-testid="kiosk-repair-add-another"/);
    assert.match(src, /Add another service/);
    assert.match(src, /onBack\?: \(\) => void/);
  });
});

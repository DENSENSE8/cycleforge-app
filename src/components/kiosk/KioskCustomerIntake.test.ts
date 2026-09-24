import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  KIOSK_CUSTOMER_FIELDS,
  formatKioskPhoneInput,
} from './KioskCustomerIntake';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('kiosk customer intake — one form for every channel', () => {
  it('asks phone first (it is the lookup key), then name, then email', () => {
    assert.deepEqual([...KIOSK_CUSTOMER_FIELDS], ['phone', 'name', 'email', 'address']);
  });

  it('writes ONE phone shape so a lookup matches whichever channel typed it', () => {
    assert.equal(formatKioskPhoneInput('5558675309'), '555-867-5309');
    assert.equal(formatKioskPhoneInput('(555) 867-5309'), '555-867-5309');
    assert.equal(formatKioskPhoneInput('5558'), '555-8');
    assert.equal(formatKioskPhoneInput('555'), '555');
    // Never runs past 10 digits — a paste of a formatted number stays stable.
    assert.equal(formatKioskPhoneInput('555-867-5309-99'), '555-867-5309');
    assert.equal(
      formatKioskPhoneInput(formatKioskPhoneInput('5558675309')),
      '555-867-5309',
    );
  });

  it('every kiosk channel composes it — no pane hand-rolls a contact trio', () => {
    const panes = [
      'src/app/kiosk/v2/KioskRepairPane.tsx',
      'src/app/kiosk/v2/KioskCartLedger.tsx',
    ];
    for (const pane of panes) {
      const src = read(pane);
      assert.match(src, /KioskCustomerIntake/, `${pane} must compose the shared intake`);
      // The fork this bans: a pane-local label for a contact field.
      assert.doesNotMatch(
        src,
        /label="(Phone|Phone number|Name|Customer Name|Email \(optional\))"/,
        `${pane} must not re-declare a contact field`,
      );
    }
  });
});

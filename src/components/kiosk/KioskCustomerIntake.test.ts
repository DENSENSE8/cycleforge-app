import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIOSK_CUSTOMER_FIELDS,
  formatKioskPhoneInput,
} from './KioskCustomerIntake';
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
});

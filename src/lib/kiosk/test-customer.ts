/**
 * The counter's TEST customer — one fixed identity the "Test customer" key on
 * the contact step fills in, so a repair intake can be walked and audited end
 * to end without a real person's details (operator 2026-10-09). Fixed, not
 * random: every test visit lands on the SAME customer row (phone match), so
 * test repairs are one search away and never spread across new customers.
 * Offered outside production only (`KioskCustomerIntake`).
 */

import { encodeShipToAddress } from '@/lib/customers/ship-to-address';

export const KIOSK_TEST_CUSTOMER = {
  phone: '555-555-0100',
  name: 'TEST CUSTOMER',
  email: 'test-customer@example.com',
  address: encodeShipToAddress({
    address1: '123 Audit Way',
    address2: 'Suite 9',
    city: 'Testville',
    state: 'CA',
    postalCode: '90210',
  }),
} as const;

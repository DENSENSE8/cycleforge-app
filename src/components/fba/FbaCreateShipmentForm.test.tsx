/**
 * FBA plan-form guardrails.
 *
 * npx tsx --test src/components/fba/FbaCreateShipmentForm.test.tsx
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./FbaCreateShipmentForm.tsx', import.meta.url), 'utf8');

test('the due date is the governed compact civil-day picker', () => {
  assert.match(source, /<DateRangePickerField[\s\S]*variant="compact"/);
  assert.match(source, /dateKeyToLocalDate\(form\.due_date\)/);
  assert.match(source, /localDateToDateKey\(day\)/);
  assert.doesNotMatch(source, /<input[\s\S]*type="date"/);
});

test('plan errors use semantic danger ink', () => {
  assert.match(source, /text-text-danger/);
  assert.doesNotMatch(source, /text-red-\d{2,3}/);
});

test('technician and packer use the governed staff picker', () => {
  assert.match(source, /StageStaffAssignPopover/);
  assert.match(source, /role="picker"/);
  assert.match(source, /role="packer"/);
  assert.match(source, /StaffAvatar/);
  assert.doesNotMatch(source, /<select/);
});

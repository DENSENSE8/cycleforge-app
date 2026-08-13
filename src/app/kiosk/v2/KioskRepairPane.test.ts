/**
 * Landscape kiosk repair checkout must show every contact field at once.
 * Pinning CustomerInfoForm to CONTACT_FIELDS[length-1] ('extras') hides
 * name/phone/email and permanently disables submit.
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

  it('uses CustomerInfoForm layout="all" so name/phone/email render', () => {
    assert.match(src, /<CustomerInfoForm[\s\S]*?layout="all"/);
  });

  it('does not pin the stepped wizard to extras', () => {
    assert.doesNotMatch(src, /CONTACT_FIELDS\[CONTACT_FIELDS\.length\s*-\s*1\]/);
    assert.doesNotMatch(src, /activeField=\{CONTACT_FIELDS/);
  });

  it('uses ReasonSelector appearance="pills" (Phase 2 SoT)', () => {
    assert.match(src, /<ReasonSelector[\s\S]*?appearance="pills"/);
  });
});

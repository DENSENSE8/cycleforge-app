/**
 * Desk record walks refuse scan-station flush fields.
 * Flush floating labels / flush searchable selects are edge-to-edge chrome.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

const DESK_WALK_FILES = [
  'src/components/sidebar/receiving/incoming/IncomingAddInboundForm.tsx',
  'src/components/receiving/incoming/IncomingAddWalkHost.tsx',
  'src/components/receiving/incoming/IncomingAddDeskField.tsx',
  'src/components/receiving/incoming/IncomingAddExtractComposer.tsx',
  'src/components/receiving/incoming/IncomingAddInboundSections.tsx',
  'src/components/outbound/orders/exceptions/ExceptionEditor.tsx',
  'src/components/outbound/orders/exceptions/ExceptionOrderFields.tsx',
  'src/components/outbound/orders/paperwork/PaperworkEditor.tsx',
  'src/design-system/components/DeskRecordWalkHost.tsx',
] as const;

describe('desk walk flush ban', () => {
  it('does not import appearance=flush on desk record walks', () => {
    for (const rel of DESK_WALK_FILES) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      assert.equal(
        /appearance=["']flush["']/.test(src),
        false,
        `${rel} must not mount flush (scan-station) fields`,
      );
    }
  });
});

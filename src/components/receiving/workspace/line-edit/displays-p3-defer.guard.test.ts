/**
 * P3 Displays bodies must stay behind dynamic() — strip chrome stays eager.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/displays-p3-defer.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const read = (rel: string) => code(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Displays P3 bodies deferred', () => {
  it('Unbox tabs dynamic-import Ticket · Photos · Timeline · Support', () => {
    const tabs = read(
      'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
    );
    assert.match(tabs, /dynamic\(/);
    assert.match(tabs, /TicketDisplayHost/);
    assert.match(tabs, /PhotosDisplayHost/);
    assert.match(tabs, /WorkspaceTimelineTab/);
    assert.match(tabs, /SupportContextHub/);
    // Eager static import of Ticket host is banned (must be dynamic()).
    assert.doesNotMatch(
      tabs,
      /import\s+\{\s*TicketDisplayHost\s*\}\s+from/,
      'TicketDisplayHost must not be a static import',
    );
  });

  it('Testing displays dynamic-import Ticket chat + Timeline', () => {
    const testing = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    assert.match(testing, /dynamic\(/);
    assert.match(testing, /SupportContextHub/);
    assert.match(testing, /WorkspaceTimelineTab/);
    assert.doesNotMatch(
      testing,
      /import\s+\{\s*SupportContextHub\s*\}\s+from/,
      'SupportContextHub must not be a static import',
    );
  });
});

/**
 * Guard: station / sidebar recent-rail hosts scroll through SidebarRailScrollport.
 * Never hand-roll useMoreBelow + SCROLL_MORE_BELOW_CLASS outside the SoT.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoSrc = join(here, '../../..');

const HOSTS: Array<{ rel: string; label: string }> = [
  { rel: 'components/sidebar/ReceivingSidebarPanel.tsx', label: 'Receiving (Unbox/Triage/Pickup)' },
  { rel: 'components/sidebar/TestingSidebarPanel.tsx', label: 'Testing' },
  { rel: 'components/sidebar/ShippingSidebarPanel.tsx', label: 'Shipping' },
  { rel: 'components/station/StationPacking.tsx', label: 'Pack' },
  { rel: 'components/station/StationTesting.tsx', label: 'StationTesting' },
  { rel: 'components/fba/sidebar/FbaWorkspaceSidebar.tsx', label: 'FBA' },
  {
    rel: 'components/support/zendesk/queue/SupportTicketsRecentRail.tsx',
    label: 'Support tickets',
  },
];

const SCROLLPORT_IMPORT = /from ['"]@\/components\/sidebar\/rail-shell\/SidebarRailScrollport['"]/;
const HAND_ROLLED_HOOK = /useMoreBelow/;
const HAND_ROLLED_CLASS = /SCROLL_MORE_BELOW_CLASS/;

test('recent-rail hosts import SidebarRailScrollport', () => {
  for (const { rel, label } of HOSTS) {
    const src = readFileSync(join(repoSrc, rel), 'utf8');
    assert.match(
      src,
      SCROLLPORT_IMPORT,
      `${label} (${rel}) must import SidebarRailScrollport`,
    );
  }
});

test('recent-rail hosts do not hand-roll the more-below fade', () => {
  for (const { rel, label } of HOSTS) {
    const src = readFileSync(join(repoSrc, rel), 'utf8');
    assert.doesNotMatch(
      src,
      HAND_ROLLED_HOOK,
      `${label} (${rel}) must not call useMoreBelow directly — use SidebarRailScrollport`,
    );
    assert.doesNotMatch(
      src,
      HAND_ROLLED_CLASS,
      `${label} (${rel}) must not reference SCROLL_MORE_BELOW_CLASS — use SidebarRailScrollport`,
    );
  }
});

test('SidebarRailScrollport owns the fade SoT', () => {
  const src = readFileSync(join(here, 'SidebarRailScrollport.tsx'), 'utf8');
  assert.match(src, /useMoreBelow/);
  assert.match(src, /SCROLL_MORE_BELOW_CLASS/);
  assert.match(src, /scrollbar-hide/);
});

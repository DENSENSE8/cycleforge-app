/**
 * Guard — Unbox pinned-Inbound pattern (hardened per Gemini rulings).
 *
 * Covers:
 *   S1  Pin-list composer is a pushpin, not a bare `+` (D6 · D12 · C14)
 *   S2  Band-1 extras hard-capped at UNBOX_PINNED_EXTRA_TABS_MAX (D2 · D14)
 *   S3  Embed uses its OWN `incoming_embed` prefs bucket, split from `/incoming` (D13)
 *   S4  Embed is triage-only — no IncomingWorkspaceHeader / Check·Import·Add (D8 · C10)
 *
 * Run: `tsx --test src/components/receiving/unbox/unbox-pinned-inbound.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The `if (embedded) { … }` region of ReceivingLinesTable, up to the desk branch. */
function embeddedRegion(table: string): string {
  const start = table.indexOf('if (embedded) {');
  const end = table.indexOf('if (isIncomingMode || isInboundDocked) {');
  assert.ok(start >= 0 && end > start, 'embed branch anchors not found');
  return table.slice(start, end);
}

describe('Unbox pinned Inbound', () => {
  it('S3 — embedded Incoming path uses its own incoming_embed prefs bucket (D13)', () => {
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    const embed = embeddedRegion(table);
    // Provider + IncomingGridView both mount the embed bucket, so hiding a
    // column on the Unbox Inbound tab never touches the `/incoming` desk.
    assert.match(embed, /tableId="incoming_embed"/, 'embed provider must use incoming_embed');
    assert.match(
      embed,
      /<IncomingGridView[\s\S]*?tableId="incoming_embed"/,
      'embed IncomingGridView must be passed incoming_embed',
    );
    // And the embed branch must NOT fall back to the shared `/incoming` bucket.
    assert.doesNotMatch(embed, /tableId="incoming"(?!_)/, 'embed must not use the shared incoming bucket');
  });

  it('S3 — the full /incoming desk keeps the shared incoming bucket', () => {
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    // The desk branch resolves `incoming` (not `incoming_embed`) for Pipeline.
    assert.match(table, /tableId=\{isIncomingMode \? 'incoming' : 'receiving'\}/);
    // incoming_embed is a real TableId (exhaustive Record keeps this honest).
    const cols = read('src/lib/tables/table-columns.ts');
    assert.match(cols, /\| 'incoming_embed'/);
    assert.match(cols, /incoming_embed: \[/);
  });

  it('S4 — the embed is triage-only: no IncomingWorkspaceHeader / Check·Import·Add', () => {
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    const embed = embeddedRegion(table);
    // The embed mounts IncomingGridView directly — never the desk header that
    // carries IncomingChromeActions (Check unreceived · Import eBay · Add PO).
    // Match JSX mounts so the explanatory comment above can name them.
    assert.doesNotMatch(embed, /<IncomingWorkspaceHeader/, 'embed must not mount the Incoming desk header');
    assert.doesNotMatch(embed, /<IncomingChromeActions/, 'embed must not mount the Incoming CTA cluster');
    // Unbox chrome never imports the Incoming desk CTA cluster (Import lives
    // on `/incoming` only). Box-station Add is ReceivingBoxChromeActions —
    // Check · Add · Unbox — not IncomingChromeActions.
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.doesNotMatch(header, /IncomingChromeActions/);
    assert.doesNotMatch(header, /IncomingWorkspaceHeader/);
    assert.match(header, /ReceivingBoxChromeActions/);
    assert.match(header, /IncomingAddInboundOverlay/);
  });

  it('S1/S2 — Pin-list composer + capped prefs pin key are wired on Unbox chrome', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /UnboxAddListPopover/);
    assert.match(header, /unboxPinnedExtraTabs/);
    assert.match(header, /leading=\{/);
    // Hard cap wired (D2 · D14).
    assert.match(header, /UNBOX_PINNED_EXTRA_TABS_MAX/);
    assert.match(header, /atCap=/);
  });

  it('S1 — the composer is a pushpin, never a leading bare `+` (D12 · C14)', () => {
    const popover = read('src/components/receiving/unbox/UnboxAddListPopover.tsx');
    // Pushpin glyph + Pin-list copy + renamed testid — no `Plus` create affordance.
    assert.match(popover, /\bPin\b/);
    assert.match(popover, /data-testid="unbox-pin-list"/);
    assert.doesNotMatch(popover, /\bPlus\b/, 'no leading bare Plus (reads as "create table")');
    // Same boxed cube as carton Exit / Back-to-list — not a naked IconButton.
    assert.match(popover, /STATION_CONTEXT_BOXED_CUBE_CLASS/);
    assert.doesNotMatch(popover, /\bIconButton\b/);
    assert.match(popover, /h-full aspect-square/);
  });

  it('catalog SoT is Inbound-only and pin cap is 2', () => {
    const catalog = read('src/lib/receiving/unbox-extra-tabs.ts');
    assert.match(catalog, /id: 'incoming'/);
    assert.match(catalog, /UNBOX_EXTRA_TAB_CATALOG/);
    assert.match(catalog, /UNBOX_PINNED_EXTRA_TABS_MAX = 2/);
    // Freeze: exactly one catalog entry for the 90-day window (D3).
    const ids = [...catalog.matchAll(/\bid: '(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['incoming'], 'catalog must stay Inbound-only (freeze D3)');
  });
});

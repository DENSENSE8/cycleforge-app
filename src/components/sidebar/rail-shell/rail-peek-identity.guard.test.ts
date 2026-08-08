/**
 * Source guard: rail hover peeks paint identity as paired rows
 * (order·trk → sku·sn → ticket → bin) via RailPeekIdentityFacts —
 * `justify-between` for air between pair partners; never tracking `ml-auto`.
 *
 * SoT: rail-shell/RailPeekIdentityFacts.tsx
 * Consumers: RailPeekCard · ReceivingPopoverContent (RecentActivityRailBase)
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/rail-shell/rail-peek-identity.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('RailPeekIdentityFacts: paired rows (order·trk / sku·sn) — no tracking ml-auto', () => {
  const facts = code(sourceOf('./RailPeekIdentityFacts.tsx'));
  assert.match(facts, /export function RailPeekIdentityFacts/);
  assert.match(facts, /export type RailPeekFact/);
  assert.match(facts, /STACK_PAIR_ROWS/);
  assert.match(
    facts,
    /\['order', 'po', 'tracking'\][\s\S]*?\['sku', 'serial'\][\s\S]*?\['ticket'\]/,
    'pair recipe must be order·trk → sku·sn → ticket',
  );
  assert.match(
    facts,
    /return \[id, tracking\]/,
    'order/PO leads the top pair; tracking sits justify-between end',
  );
  // Pad / seam / chip-stack come from the shared chrome SoT.
  assert.match(facts, /RAIL_PEEK_SECTION_CLASS/);
  assert.match(facts, /RAIL_PEEK_CHIP_STACK_CLASS/);
  assert.match(facts, /RAIL_PEEK_CHIP_PAIR_CLASS/);
  assert.match(facts, /RAIL_PEEK_CHIP_FACE_FLUSH_CLASS/);
  assert.doesNotMatch(
    facts,
    /flex flex-wrap[\s\S]*justify-between/,
    'identity facts must not use flex-wrap justify-between for the full chip strip',
  );
  // Tracking must NOT be shoved to the far edge of the peek.
  assert.doesNotMatch(
    facts,
    /tracking[\s\S]{0,200}ml-auto|ml-auto[\s\S]{0,200}tracking/,
    'tracking chip must not use ml-auto (lopsided header)',
  );
  // ml-auto only for the pickup headerRight carve-out.
  assert.match(facts, /showOrderWithPill/);
  assert.match(facts, /headerRight/);
  for (const chip of [
    'OrderIdChip',
    'PoChip',
    'SkuScanRefChip',
    'TrackingChip',
    'SerialChip',
    'TicketChip',
    'BinChip',
  ]) {
    assert.match(facts, new RegExp(chip), `must render ${chip}`);
  }
  assert.match(facts, /keepEmpty/);
  // Platform / carrier paint resolves in the peek SoT — not per-host.
  assert.match(facts, /platformValue\?:/);
  assert.match(facts, /carrierHint\?:/);
  assert.match(facts, /usePlatformMeta/);
  assert.match(facts, /platformMetaIconTone/);
  assert.match(facts, /platformLabel=\{platformLabel\}/);
  assert.match(facts, /carrierHint=\{fact\.carrierHint/);
  // Face parity lives in PEEK_FACE (last8 + fit) — chips spread it, no per-tone literals.
  assert.match(
    facts,
    /const PEEK_FACE = \{[\s\S]*?displayWidth: 'last8'[\s\S]*?fitDisplayWidth: true/,
    'PEEK_FACE must lock last8 + fitDisplayWidth',
  );
  assert.match(facts, /fitDisplayWidth/);
  // Explicit list stack of paired rows — tracking sits beside order, never ml-auto.
  assert.match(facts, /data-rail-peek-identity="stack"/);
  assert.match(facts, /role="list"/);
  assert.match(facts, /<ul className=\{RAIL_PEEK_CHIP_STACK_CLASS\}/);
  assert.match(facts, /className=\{RAIL_PEEK_CHIP_PAIR_CLASS\}/);
  assert.match(facts, /PEEK_FACE/);
  // Face parity: every typed peek chip spreads PEEK_FACE; serial drops the table width.
  assert.match(
    facts,
    /SkuScanRefChip[\s\S]*?\{\.\.\.PEEK_FACE\}/,
    'SkuScanRefChip must spread PEEK_FACE (last8 + fitDisplayWidth)',
  );
  assert.match(
    facts,
    /SerialChip[\s\S]*?width="w-fit max-w-full shrink-0"[\s\S]*?\{\.\.\.PEEK_FACE\}/,
    'SerialChip must override table w-[120px] and spread PEEK_FACE',
  );
  assert.match(
    facts,
    /TrackingChip[\s\S]*?\{\.\.\.PEEK_FACE\}/,
    'TrackingChip must spread PEEK_FACE',
  );
  assert.match(
    facts,
    /OrderIdChip[\s\S]*?\{\.\.\.PEEK_FACE\}/,
    'OrderIdChip must spread PEEK_FACE when value is present',
  );
  assert.match(
    facts,
    /platformFace|UNKNOWN_PLATFORM/,
    'empty order face must paint catalog platform label (hover-parity)',
  );
  // Empty keepEmpty order: face = catalog label; skip last8 lock (content width).
  assert.match(
    facts,
    /empty \? platformFace[\s\S]*?empty \? \{ fitDisplayWidth: true/,
    'empty order must use platformFace + fitDisplayWidth (not PEEK_FACE last8)',
  );
  assert.match(
    facts,
    /platformLabel && platformLabel !== UNKNOWN_PLATFORM\.label/,
    'unknown platform must not invent a slug face — falls through to quiet empty',
  );
});

test('CopyChip typed faces forward last8 + fit for peek parity', () => {
  const chip = code(sourceOf('../../ui/CopyChip.tsx'));
  // SkuScanRefChip must accept + forward both face props (root of SKU vs serial gap).
  assert.match(
    chip,
    /export const SkuScanRefChip = \([\s\S]*?fitDisplayWidth = false[\s\S]*?displayWidth = 'content'[\s\S]*?fitDisplayWidth=\{fitDisplayWidth\}[\s\S]*?displayWidth=\{displayWidth\}/,
    'SkuScanRefChip must forward fitDisplayWidth + displayWidth into CopyChip',
  );
  // SerialChip must accept + forward displayWidth / fitDisplayWidth (fit defaults on).
  assert.match(
    chip,
    /export const SerialChip = \([\s\S]*?displayWidth = 'content'[\s\S]*?fitDisplayWidth = true[\s\S]*?fitDisplayWidth=\{fitDisplayWidth\}[\s\S]*?displayWidth=\{displayWidth\}/,
    'SerialChip must forward displayWidth + fitDisplayWidth into CopyChip',
  );
  // TrackingChip uses CarrierMark chip footprint — never the h-5 mark box.
  assert.match(
    chip,
    /CarrierMark meta=\{brand\} footprint="chip"/,
    'TrackingChip must use CarrierMark footprint=chip',
  );
});

test('rail-peek-chrome: one pad + one ruled-section seam', () => {
  const chrome = code(sourceOf('./rail-peek-chrome.ts'));
  assert.match(chrome, /RAIL_PEEK_PAD_CLASS = 'p-3'/);
  assert.match(chrome, /RAIL_PEEK_SECTION_CLASS/);
  assert.match(chrome, /mt-2\.5 border-t border-border-hairline pt-2\.5/);
  assert.match(chrome, /RAIL_PEEK_CHIP_STACK_CLASS/);
  assert.match(chrome, /gap-y-1/);
  assert.match(chrome, /RAIL_PEEK_CHIP_PAIR_CLASS/);
  assert.match(chrome, /justify-between gap-x-1/);
  assert.doesNotMatch(
    chrome,
    /RAIL_PEEK_CHIP_PAIR_CLASS[\s\S]{0,120}ml-auto/,
    'pair row uses justify-between — never ml-auto on a chip',
  );
  assert.match(chrome, /RAIL_PEEK_CHIP_FACE_FLUSH_CLASS/);
  assert.match(chrome, /data-chip-face\]\]:px-0/);
  assert.match(chrome, /button\]:gap-1/);
});

test('RailPeekCard composes RailPeekIdentityFacts + shared peek chrome', () => {
  const card = code(sourceOf('./RailPeekCard.tsx'));
  assert.match(card, /RailPeekIdentityFacts/);
  assert.match(card, /export type \{ RailPeekFact \}/);
  assert.match(card, /RAIL_PEEK_PAD_CLASS/);
  assert.match(card, /RAIL_PEEK_SECTION_CLASS/);
  assert.doesNotMatch(card, /space-y-3 p-3\.5/);
  assert.doesNotMatch(card, /flex flex-wrap items-center/);
  assert.doesNotMatch(card, /OrderIdChip/);
});

test('Receiving popover composes RailPeekIdentityFacts (no local twin strip)', () => {
  const recent = code(sourceOf('../receiving/RecentActivityRailBase.tsx'));
  assert.match(recent, /RailPeekIdentityFacts/);
  assert.match(recent, /headerRight=\{isPickup/);
  assert.match(recent, /tone: 'order'/);
  assert.match(
    recent,
    /tone: 'order'[\s\S]*?keepEmpty:\s*true/,
    'order slot must keepEmpty so unfound peeks pin a placeholder top-right',
  );
  assert.match(recent, /tone: 'serial'/);
  assert.doesNotMatch(
    recent,
    /tone: 'serial'[\s\S]{0,80}keepEmpty:\s*true/,
    'empty serial must omit the chip — never keepEmpty placeholder',
  );
  assert.match(recent, /RAIL_PEEK_PAD_CLASS/);
  assert.match(recent, /RAIL_PEEK_SECTION_CLASS/);
  assert.doesNotMatch(recent, /space-y-3 p-3\.5/);
  assert.doesNotMatch(
    recent,
    /flex flex-wrap items-center justify-between/,
    'Receiving popover must not keep a local flex-wrap chip strip',
  );
  assert.doesNotMatch(recent, /OrderIdChip/);
  assert.doesNotMatch(recent, /TrackingChip/);
  assert.doesNotMatch(recent, /SkuScanRefChip/);
  assert.doesNotMatch(recent, /SerialChip/);
  assert.doesNotMatch(recent, /TicketChip/);
  assert.match(recent, /platformValue:\s*row\.source_platform_pill \|\| row\.source_platform/);
  assert.match(recent, /carrierHint:\s*row\.carrier/);
});

test('outbound recent-rail hosts pass raw platformValue on order facts', () => {
  const hosts = [
    ['../../outbound/labels/LabelsRecentRail.tsx', /platformValue:\s*row\.account_source/],
    ['../packer/PackRecentPacksRail.tsx', /platformValue:\s*row\.account_source/],
    ['../shipping/ShippingStaffScanHistoryRail.tsx', /platformValue:\s*row\.account_source/],
  ] as const;
  for (const [rel, pattern] of hosts) {
    assert.match(code(sourceOf(rel)), pattern, `${rel} must pass platformValue`);
    assert.doesNotMatch(
      code(sourceOf(rel)),
      /OrderIdChip|platformMetaIconTone/,
      `${rel} must not paint chips locally — RailPeekIdentityFacts owns the ladder`,
    );
  }
  // Labels + Pack feeds expose carrier — pass carrierHint. TechRecord does not.
  assert.match(
    code(sourceOf('../../outbound/labels/LabelsRecentRail.tsx')),
    /carrierHint:\s*row\.carrier/,
    'Labels peek must pass carrierHint when the feed has carrier',
  );
  assert.match(
    code(sourceOf('../packer/PackRecentPacksRail.tsx')),
    /carrierHint:\s*row\.carrier/,
    'Pack peek must pass carrierHint when the feed has carrier',
  );
  assert.doesNotMatch(
    code(sourceOf('../shipping/ShippingStaffScanHistoryRail.tsx')),
    /carrierHint:\s*row\.carrier/,
    'Shipping TechRecord has no carrier column — do not invent row.carrier',
  );
});

/**
 * CartonMatchHub unification (Package Pairing P1).
 * One hub for Unbox + Arrival; Auto-match embeds inside when unfound.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const HUB = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/CartonMatchHub.tsx',
);
const PO = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/POUnboxingSection.tsx',
);
/** Package Pairing's home since 2026-08-02 — the `pairing` Displays tab. */
const UNBOX_TABS = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
);
const TRIAGE = join(
  process.cwd(),
  'src/components/receiving/triage/TriageLineMatchingSection.tsx',
);

describe('CartonMatchHub (P1)', () => {
  const hub = readFileSync(HUB, 'utf8');

  it('exposes tabSet, chrome, and autoFocusSearch', () => {
    assert.match(hub, /tabSet\?: CartonMatchTabSet/);
    assert.match(hub, /chrome\?: CartonMatchHubChrome/);
    assert.match(hub, /autoFocusSearch\?: boolean/);
  });

  it('bare Unbox Displays: secondary dropdown, no Package Pairing title, no pencil, no avenue stack', () => {
    // Unbox Displays mounts chrome="bare" — one flat display body.
    assert.match(hub, /bareChrome/);
    assert.match(hub, /variant="secondary"/);
    assert.match(hub, /DropdownMenu/);
    assert.match(hub, /selectAutoMode/);
    assert.doesNotMatch(hub, /AvenueStripButton/);
    assert.doesNotMatch(hub, /variant="display"/);
    assert.doesNotMatch(hub, /flex flex-col gap-2/);
    assert.match(hub, /id: 'zoho_item'/);
    assert.doesNotMatch(hub, /id: 'other'/);
    assert.doesNotMatch(hub, /CartonAddInline/);
    // Pencil only on card hosts (`!bareChrome`); Store is a mode menu item.
    assert.match(hub, /!embedded && !bareChrome/);
    // Bare return path is titleless WorkspaceCard.
    assert.match(hub, /if \(bareChrome\) \{\s*return <WorkspaceCard overflow="visible">/);
    // Bare does not mount a sibling UnfoundMatchStrip action grid.
    assert.match(hub, /showQuickMatchStrip = Boolean\(autoMatch\) && !pickerCollapsed && !bareChrome/);
    assert.match(hub, /forcedLane=/);
  });

  it('embeds UnfoundMatchStrip when autoMatch is set (visible even when pairing collapsed)', () => {
    assert.match(hub, /UnfoundMatchStrip/);
    assert.match(hub, /showQuickMatchStrip|showAutoMatchMenu/);
    // Strip must not be gated on `collapsed` — unfound Auto-match stays open.
    assert.doesNotMatch(hub, /!pickerCollapsed && !collapsed/);
    assert.match(hub, /Boolean\(autoMatch\) && !pickerCollapsed/);
  });

  it('opens PO tab on receiving-open-pairing-po (carton # ---- → Link PO)', () => {
    assert.match(hub, /RECEIVING_OPEN_PAIRING_PO_EVENT/);
    assert.match(hub, /openPairingTab\('zoho_po'\)/);
    assert.match(hub, /openPairingTab\('ecwid'\)/);
  });

  it('does not auto-search tracking on Package Pairing expand', () => {
    assert.doesNotMatch(hub, /usePoSuggestions/);
    assert.doesNotMatch(hub, /PoSuggestBanner/);
  });

  it('the pairing display mounts the hub with autoMatch — never a sibling UnfoundMatchStrip', () => {
    // Package Pairing moved out of the `contents` step body and onto the right
    // edge (2026-08-02), so the mount this protects moved with it. The
    // invariant is unchanged: Auto-match embeds INSIDE the hub.
    const src = readFileSync(UNBOX_TABS, 'utf8');
    assert.doesNotMatch(src, /<UnfoundMatchStrip/);
    assert.match(src, /<CartonMatchHub/);
    assert.match(src, /autoMatch=/);
    assert.match(src, /chrome="bare"/);
    assert.match(src, /id: 'pairing'/);
  });

  it('POUnboxingSection is the PO line list only — no pairing, no strip', () => {
    const src = readFileSync(PO, 'utf8');
    assert.doesNotMatch(src, /<UnfoundMatchStrip/);
    assert.doesNotMatch(
      src,
      /<CartonMatchHub/,
      'pairing lives on the right edge — a control there must not open a surface in the centre',
    );
    assert.doesNotMatch(src, /pairingOpen/);
  });

  it('TriageLineMatchingSection is a thin arrival wrapper', () => {
    const src = readFileSync(TRIAGE, 'utf8');
    assert.match(src, /tabSet="arrival"/);
    assert.match(src, /autoFocusSearch=\{false\}/);
  });
});

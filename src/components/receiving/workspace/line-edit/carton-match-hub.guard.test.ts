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
/** Linkage (Pairing + Zoho note) — Displays strip since 2026-08-05. */
const UNBOX_TABS = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
);
/**
 * Arrival Package Pairing is the Linkage body of the Displays push since
 * 2026-08-05 (scan-station Displays SoT) — the old centre wrapper
 * `TriageLineMatchingSection` is deleted. Arrival mounts the hub directly here.
 */
const ARRIVAL_DISPLAYS = join(
  process.cwd(),
  'src/components/receiving/triage/build-triage-displays.tsx',
);

describe('CartonMatchHub (P1)', () => {
  const hub = readFileSync(HUB, 'utf8');

  it('exposes tabSet, chrome, and autoFocusSearch', () => {
    assert.match(hub, /tabSet\?: CartonMatchTabSet/);
    assert.match(hub, /chrome\?: CartonMatchHubChrome/);
    assert.match(hub, /autoFocusSearch\?: boolean/);
  });

  it('bare Unbox Displays: Pairing-only secondary dropdown, no Package Pairing title, no pencil', () => {
    // Unbox Displays mounts chrome="bare" — strip + Pairing avenue body.
    assert.match(hub, /bareChrome/);
    assert.match(hub, /variant="secondary"/);
    assert.match(hub, /DropdownMenu/);
    assert.match(hub, /selectAvenue/);
    // Auto-match is a sibling strip — not absorbed into the Pairing dropdown.
    assert.doesNotMatch(hub, /selectAutoMode/);
    assert.doesNotMatch(hub, /showAutoMatchMenu/);
    assert.doesNotMatch(hub, /forcedLane=/);
    assert.doesNotMatch(hub, /AvenueStripButton/);
    assert.doesNotMatch(hub, /variant="display"/);
    assert.doesNotMatch(hub, /flex flex-col gap-2/);
    assert.match(hub, /id: 'zoho_item'/);
    assert.doesNotMatch(hub, /id: 'other'/);
    assert.doesNotMatch(hub, /CartonAddInline/);
    // Pencil only on card hosts (`!bareChrome`); Store is a mode menu item.
    assert.match(hub, /!embedded && !bareChrome/);
    // Bare Displays body is a flush plane — no WorkspaceCard island / rounded shell.
    assert.match(hub, /PAIRING_FLUSH_HOST_CLASS/);
    assert.match(hub, /cornerClass\('flush'\)/);
    assert.match(
      hub,
      /if \(bareChrome\) \{\s*return <div className=\{PAIRING_FLUSH_HOST_CLASS\}>/,
    );
    assert.doesNotMatch(
      hub,
      /if \(bareChrome\) \{\s*return <WorkspaceCard/,
    );
    // Card chrome still uses labeled WorkspaceCard.
    assert.match(hub, /<WorkspaceCard label="Package Pairing"/);
    // Bare + card share the strip gate (no bare exclusion).
    assert.match(hub, /showQuickMatchStrip = Boolean\(autoMatch\) && !pickerCollapsed;/);
  });

  it('bare avenue trigger and candidate rows are flush (zero radius)', () => {
    assert.match(hub, /cornerClass\('flush'\).*px-3|px-3.*cornerClass\('flush'\)/s);
    const row = readFileSync(
      join(process.cwd(), 'src/components/receiving/workspace/line-edit/PairingLinkButton.tsx'),
      'utf8',
    );
    assert.match(row, /PAIRING_CANDIDATE_ROW_CLASS/);
    assert.match(row, /cornerClass\('flush'\)/);
    assert.doesNotMatch(row, /PAIRING_CANDIDATE_ROW_CLASS[\s\S]*rounded-lg/);
  });

  it('embeds UnfoundMatchStrip when autoMatch is set (visible even when pairing collapsed)', () => {
    assert.match(hub, /UnfoundMatchStrip/);
    assert.match(hub, /showQuickMatchStrip/);
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

  it('the Linkage display mounts the hub with autoMatch — never a sibling UnfoundMatchStrip', () => {
    // Package Pairing moved to Displays (2026-08-02), then into Linkage
    // (2026-08-05). Auto-match still embeds INSIDE the hub.
    const tabs = readFileSync(UNBOX_TABS, 'utf8');
    const linkage = readFileSync(
      join(process.cwd(), 'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx'),
      'utf8',
    );
    assert.doesNotMatch(tabs, /<UnfoundMatchStrip/);
    assert.match(tabs, /<LinkageDisplayHost/);
    assert.match(tabs, /id: 'linkage'/);
    assert.match(tabs, /autoMatch=/);
    assert.match(linkage, /<CartonMatchHub/);
    assert.match(linkage, /chrome="bare"/);
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

  it('Arrival Package Pairing is the bare Linkage display, not a centre wrapper', () => {
    // The old centre card (TriageLineMatchingSection) is gone; Arrival mounts
    // CartonMatchHub as the Linkage body of the Displays push — same grammar as
    // Unbox: tabSet="arrival", chrome="bare", never auto-focus on a Station.
    const src = readFileSync(ARRIVAL_DISPLAYS, 'utf8');
    assert.match(src, /<CartonMatchHub/);
    assert.match(src, /tabSet="arrival"/);
    assert.match(src, /chrome="bare"/);
    assert.match(src, /autoFocusSearch=\{false\}/);
  });
});

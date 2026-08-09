/**
 * Source guard: scan-station PO lines are a flat hairline data floor — not
 * rounded card bubbles. Active selection uses QUEUE_ROW; outcome feedback is
 * scan-band flash + row pulse + audio, never persistent green/red card borders.
 *
 * Plan: flat scan stations / state feedback without card borders.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/po-line-flat-chrome.guard.test.ts
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

const PO_LINE_ROW = code(sourceOf('./PoLineRow.tsx'));
const QUEUE_ROW_CHROME = code(sourceOf('../../ui/queue-row-chrome.ts'));
const PO_UNBOX = code(sourceOf('./line-edit/POUnboxingSection.tsx'));
const ACCORDION = code(sourceOf('./PoLinesAccordion.tsx'));
const GLOW = code(sourceOf('../../station/scan-bar/ScanBandGlowHost.tsx'));
const SCAN_FEEDBACK = code(sourceOf('../../../lib/scan-feedback/useScanFeedback.ts'));
const VISUAL = code(sourceOf('../../../lib/scan-feedback/visual.ts'));

test('PoLineRow title band carries no collapse chevron (capture is in the bottom dock)', () => {
  // The per-line collapse chevron was removed 2026-08-08: capture and item
  // detail moved to the bottom dock + right-edge Displays, so the PO line row
  // is a pure ledger with no top-right collapse control on the title band.
  assert.doesNotMatch(
    PO_LINE_ROW,
    /Expand item details|Collapse item details|ChevronDown/,
    'title band must not mount a collapse chevron',
  );
  // The conditional line ⋮ (Unlink on unmatched/Testing) still mounts here; it
  // renders null when the line has no action, so matched Unbox lines show no ⋮.
  assert.match(
    PO_LINE_ROW,
    /<PoLineTitleMenu/,
    '⋮ line-actions menu still mounts on the title band (renders null when empty)',
  );
  // The per-line title-action slot (Testing serial 🔗 link/combine) is removed
  // as dead code — the row is a pure ledger. Item-description "more details"
  // editing lives ONLY in the right-edge Inventory Display (InventoryDisplayHost),
  // never inline on the PO line item.
  assert.doesNotMatch(
    PO_LINE_ROW,
    /renderTitleActions/,
    'no per-line title-action slot (🔗 serial-link removed) on the PO line row',
  );
  assert.doesNotMatch(
    PO_LINE_ROW,
    /Item description|zoho_notes|usePoLineItemDescriptionEditor/,
    'item-description editing moved to the Inventory Display — not the PO line row',
  );
});

test('ReturnScanCard title chevron is trailing (empty unfound stub parity)', () => {
  const RETURN = code(sourceOf('./unmatched-items/ReturnScanCard.tsx'));
  assert.match(
    RETURN,
    /\{title\}[\s\S]*?ChevronDown/,
    'empty Unfound PO stub must trail the chevron after the title',
  );
  assert.doesNotMatch(
    RETURN,
    /ChevronDown[\s\S]{0,120}\{title\}/,
    'must not keep a leading chevron before Unfound PO',
  );
});

test('PoLineRow gives the active line an opaque white face on the sunken canvas', () => {
  // The working row is the operator's current context: it must paint an opaque
  // bg-surface-card face (via the station-canvas selection token) so title,
  // meta, and the expanded serial/condition evidence sit on a solid plane —
  // never the bg-blue-50 wash alone, which disappears on bg-surface-sunken.
  assert.match(PO_LINE_ROW, /QUEUE_ROW\.selectedStationClass/);
  assert.doesNotMatch(
    PO_LINE_ROW,
    /QUEUE_ROW\.selectedClass\b/,
    'active line must use selectedStationClass (white face), not the wash-only selectedClass',
  );
  assert.match(PO_LINE_ROW, /border-b border-border-soft/);
  assert.match(PO_LINE_ROW, /rounded-none/);
});

test('PoLineRow inactive rows own a solid contact fill (vertical flush stack)', () => {
  // Every row in the accordion paints a face so contact edges read against
  // solid backgrounds — never bg-transparent holes on the sunken canvas.
  assert.match(PO_LINE_ROW, /bg-surface-card hover:bg-surface-hover/);
  assert.doesNotMatch(
    PO_LINE_ROW,
    /bg-transparent hover:bg-surface-hover/,
    'inactive station rows must not leave transparent contact gaps',
  );
});

test('PoLineRow thumb is square flush (left rail continuous stack)', () => {
  const THUMB = code(sourceOf('./PoLineHeaderThumb.tsx'));
  const FACE = code(sourceOf('./station-scan-face.ts'));
  assert.match(THUMB, /cornerClass\('flush'\)/);
  assert.match(
    FACE,
    /thumbGrid:\s*['"]grid-cols-\[5rem_1fr\]['"]/,
    'header face: size-20 thumb | title+details',
  );
  assert.match(
    PO_LINE_ROW,
    /PO_LINE_HEADER_FACE\.thumbGrid/,
    'PoLineRow composes the size-20 thumb in the title+details band',
  );
  assert.match(
    PO_LINE_ROW,
    /PoLineHeaderThumb/,
    'product thumb uses PoLineHeaderThumb (size-20 header face)',
  );
  assert.doesNotMatch(
    PO_LINE_ROW,
    /ConditionGradeCircle|thumbConditionGrid/,
    'condition must not sit between the thumb and title+details',
  );
  assert.doesNotMatch(
    PO_LINE_ROW,
    /size-12[^\n]*rounded-md/,
    'product thumb must not use soft rounded-md',
  );
  assert.match(
    PO_LINE_ROW,
    /pl-0 pr-0/,
    'row content must sit flush left and right (no pr-3 air beside trailing actions)',
  );
  assert.match(
    PO_LINE_ROW,
    /border-t border-border-hairline bg-surface-card/,
    'expanded curtain body must paint an opaque white face with a neutral hairline seam',
  );
});

test('PoLineRow meta is a bordered boxed sub-grid (gap-x whitespace, no divide-x)', () => {
  const META = code(sourceOf('./PoLineMetaGrid.tsx'));
  assert.match(META, /gap-x-3/);
  assert.doesNotMatch(
    META,
    /divide-x/,
    'meta columns use gap whitespace — no vertical hairline cage',
  );
  assert.match(META, /border-t border-border-soft/);
  assert.match(
    META,
    /grid-cols-\[auto_auto_auto_minmax\(2\.5rem,1fr\)_auto\]/,
    'meta tracks: qty|SKU|cond|serials 1fr|price auto',
  );
  assert.match(
    META,
    /unitsChrome[\s\S]{0,80}?grid-cols-\[auto_auto_auto\]/,
    'Arrival unitsChrome=false collapses meta to qty|SKU|price',
  );
  assert.match(META, /data-units-chrome/);
  assert.match(PO_LINE_ROW, /onViewAllUnits/);
  assert.match(PO_LINE_ROW, /onEditSerialInDock/);
  assert.match(PO_LINE_ROW, /Barcode/);
  assert.match(
    PO_LINE_ROW,
    /aria-label=\{[\s\S]*Edit serial in dock[\s\S]*Edit units/,
    'serial preview opens Units or focuses the Unbox dock step (View All removed)',
  );
  assert.doesNotMatch(
    PO_LINE_ROW,
    /View [Aa]ll/,
    'View All button must not remain beside the serial preview',
  );
});

test('selectedStationClass is an opaque white face (no blue glow, no wash)', () => {
  const token = QUEUE_ROW_CHROME.match(
    /selectedStationClass:\s*'([^']+)'/,
  )?.[1];
  assert.ok(token, 'QUEUE_ROW.selectedStationClass must be defined');
  assert.match(token!, /bg-surface-card/, 'must paint an opaque white face');
  assert.doesNotMatch(
    token!,
    /ring-blue/,
    'station working-row must not use a blue inset glow',
  );
  assert.doesNotMatch(token!, /bg-blue-50/, 'the wash must not be the fill on a sunken canvas');
});

test('PoLineRow does not use elevated card shell chrome', () => {
  assert.doesNotMatch(
    PO_LINE_ROW,
    /rounded-xl border/,
    'card bubbles (rounded-xl + full border) are banned on the data floor',
  );
  assert.doesNotMatch(PO_LINE_ROW, /border-blue-300 bg-blue-50\/60/);
});

test('PoLineRow wires motionRole.feedback.pulse for match acknowledgement', () => {
  assert.match(PO_LINE_ROW, /motionRole\.feedback\.pulse/);
  assert.match(PO_LINE_ROW, /SCAN_LINE_PULSE_EVENT/);
  assert.match(PO_LINE_ROW, /ring-emerald-400/);
});

test('POUnboxingSection is a flush host — no WorkspaceCard glass island', () => {
  assert.doesNotMatch(PO_UNBOX, /WorkspaceCard/);
  assert.match(PO_UNBOX, /className="min-w-0"/);
});

test('PoLinesAccordion standalone shell is not a raised rounded card', () => {
  assert.doesNotMatch(
    ACCORDION,
    /rounded-2xl bg-surface-card p-4 shadow-sm/,
    'standalone accordion must not reintroduce the raised card island',
  );
});

test('ScanBandGlowHost listens for success/reject locus flash', () => {
  assert.match(GLOW, /SCAN_BAND_FLASH_EVENT/);
  assert.match(GLOW, /bg-emerald-400/);
  assert.match(GLOW, /bg-rose-400/);
});

test('useScanFeedback always flashes the scan band with the outcome', () => {
  assert.match(SCAN_FEEDBACK, /flashScanBand\(kind\)/);
  assert.match(VISUAL, /export function flashScanBand/);
  assert.match(VISUAL, /export function pulseScanLine/);
});

const UNBOX_OVERVIEW = code(sourceOf('./line-edit/terminal/unbox-tabs.tsx'));
const LINE_EDIT = code(sourceOf('./LineEditPanel.tsx'));
const IDENTITY = code(
  sourceOf('../../station/entity-context/station-identity-chrome.ts'),
);

test('Unbox overview has zero vertical sibling gap', () => {
  const overview = UNBOX_OVERVIEW.match(
    /export function buildUnboxOverview\([\s\S]*?\n\}/,
  )?.[0];
  assert.ok(overview, 'buildUnboxOverview must be present');
  assert.match(overview!, /space-y-0/);
  assert.doesNotMatch(
    overview!,
    /space-y-4/,
    'overview must not reintroduce space-y-4 between lines and label',
  );
});

test('Unbox StationWorkbench uses bodyGap=none on the flat floor', () => {
  assert.match(LINE_EDIT, /bodyGap=["']none["']/);
});

test('Unbox carton identity is in-flow (zero air above PO lines)', () => {
  assert.match(LINE_EDIT, /placement=["']flow["']/);
  assert.match(LINE_EDIT, /reserveIdentityClearance=\{false\}/);
  assert.doesNotMatch(
    LINE_EDIT,
    /reserveIdentityClearance=["']stacked["']/,
    'stacked pt clearance leaves a guessed gap under the absolute identity',
  );
});

const TRIAGE_PANEL = code(sourceOf('../triage/TriagePanel.tsx'));

test('Arrival carton identity is in-flow (Unbox flat parity)', () => {
  assert.match(TRIAGE_PANEL, /placement=["']flow["']/);
  assert.match(TRIAGE_PANEL, /reserveIdentityClearance=\{false\}/);
  assert.doesNotMatch(
    TRIAGE_PANEL,
    /reserveIdentityClearance=["']stacked["']/,
    'Arrival must not keep absolute overlay + stacked clearance',
  );
});

test('Arrival StationWorkbench uses bodyGap=none on the flat floor', () => {
  assert.match(TRIAGE_PANEL, /bodyGap=["']none["']/);
});

test('Arrival centre has zero vertical sibling gap', () => {
  assert.match(TRIAGE_PANEL, /space-y-0/);
  assert.doesNotMatch(
    TRIAGE_PANEL,
    /space-y-4/,
    'Arrival centre must not reintroduce space-y-4 between lines and sibling strips',
  );
});

test('identity pad is horizontal-only (zero vertical pad)', () => {
  assert.match(IDENTITY, /stationIdentityPadClass = 'px-0'/);
  assert.doesNotMatch(IDENTITY, /rounded-b-2xl/);
  assert.match(IDENTITY, /STATION_IDENTITY_ROW_STACK_CLASS = 'flex flex-col gap-0'/);
  assert.match(
    IDENTITY,
    /STATION_IDENTITY_ROW_CLASS = `flex \$\{STATION_CHROME_ROW_FACE\} items-stretch gap-0 \$\{STATION_CHROME_SEAM_HAIRLINE\}`/,
    'identity chip row must be gap-0 and stretch flush on the primary chrome face',
  );
  assert.match(
    IDENTITY,
    /STATION_IDENTITY_GROUP_CLASS = 'flex h-full min-h-0 items-stretch gap-0'/,
    'classify group must be gap-0 flush pills filling the chrome row',
  );
});

test('identity panel is a white flush curtain face', () => {
  assert.match(
    IDENTITY,
    /stationIdentityPanelClass[\s\S]*?bg-surface-card/,
    'carton identity band must paint white card, not sunken trough',
  );
  assert.doesNotMatch(
    IDENTITY,
    /stationIdentityPanelClass[\s\S]*?bg-surface-sunken/,
    'identity band must not stay sunken once the curtain is white',
  );
});

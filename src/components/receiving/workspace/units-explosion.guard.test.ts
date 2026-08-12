/**
 * Source guard: Unbox Units Displays body is flush (not a RightPaneOverlay
 * modal). Prebox is a peer Assets leaf (`PreboxDisplayHost`), not nested under
 * Units. Condition pills are square-flush with re-click clear (no trailing
 * clear control).
 *
 * Handoff: docs/todo/units-explosion-display-flush-HANDOFF.md
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/units-explosion.guard.test.ts
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

const TABS = code(sourceOf('./line-edit/terminal/unbox-tabs.tsx'));
const HOST = code(sourceOf('./line-edit/UnitsDisplayHost.tsx'));
const PREBOX_HOST = code(sourceOf('./line-edit/PreboxDisplayHost.tsx'));
const EXPLOSION = code(sourceOf('./UnitsExplosionDisplay.tsx'));
const PILLS = code(sourceOf('./ConditionPills.tsx'));
const UNIT_ROWS = code(sourceOf('./ReceivingUnitRows.tsx'));
const PREBOX = code(sourceOf('../PreboxWizard.tsx'));
const SIDE = code(sourceOf('./line-edit/unbox-side-tabs.ts'));

test('Units tab mounts UnitsDisplayHost; Prebox is a peer Assets leaf', () => {
  const unitsBlock = TABS.match(/id:\s*'units'[\s\S]*?id:\s*'prebox'/);
  assert.ok(unitsBlock, 'units tab block present before prebox');
  assert.match(unitsBlock[0], /<UnitsDisplayHost/);
  assert.doesNotMatch(
    unitsBlock[0],
    /WorkspaceCard\s+variant=["']glass["']/,
    'Units Displays body must sit flush on the push column — no glass island',
  );
  assert.match(TABS, /id:\s*'prebox'/);
  assert.match(TABS, /<PreboxDisplayHost/);
  assert.match(SIDE, /\| 'prebox'/);
  assert.match(SIDE, /case 'prebox':/);
  assert.doesNotMatch(SIDE, /hasPreboxTab/);
});

test('UnitsDisplayHost is Units body only — Prebox lives on PreboxDisplayHost', () => {
  assert.match(HOST, /data-testid="unbox-units-display"/);
  assert.match(HOST, /<UnitsExplosionDisplay/);
  assert.doesNotMatch(HOST, /StationArmedVerbList|PreboxWizard|id:\s*'prebox'/);
  assert.doesNotMatch(HOST, /\bTabDisplay\b/);
  assert.match(PREBOX_HOST, /data-testid="unbox-prebox-display"/);
  assert.match(PREBOX_HOST, /<PreboxWizard[\s\S]*embedded/);
  assert.doesNotMatch(SIDE, /UnboxUnitsAction|parseUnboxUnitsAction/);
});

test('ActiveLineExplosion is square-flush (no rounded-xl card shell)', () => {
  assert.match(EXPLOSION, /data-units-explosion-active/);
  assert.doesNotMatch(
    EXPLOSION,
    /data-units-explosion-active[\s\S]{0,200}rounded-xl/,
    'active line must not use a rounded-xl raised card',
  );
  assert.doesNotMatch(
    EXPLOSION,
    /ItemPhotoStepBody/,
    'item photos must not be a standalone section — camera lives on the active unit row',
  );
  assert.doesNotMatch(
    EXPLOSION,
    /Item photos/,
    'no ITEM PHOTOS eyebrow section in the explosion body',
  );
});

test('Units explosion mounts flush item camera on every unit row', () => {
  assert.match(EXPLOSION, /ReceivingPhotoButton/);
  assert.match(EXPLOSION, /photoStage="unbox_item"/);
  assert.match(EXPLOSION, /appearance="flush"/);
  assert.match(EXPLOSION, /activeRowLeading=\{itemCamera\}/);
  assert.match(EXPLOSION, /\bflush\b/);
  const SLOTS = code(sourceOf('./UnitSlotList.tsx'));
  // Camera mounts on every flush row (after condition) — not gated to selectedIndex.
  // cloneElement so one ReactNode prop mounts independently per row.
  assert.match(SLOTS, /cloneElement\(activeRowLeading/);
  assert.doesNotMatch(
    SLOTS,
    /index === selectedIndex[\s\S]{0,80}activeRowLeading/,
    'photo leading must not be limited to the selected unit row',
  );
  // Row order: condition meta, then photo leading (not camera-leftmost).
  assert.match(
    SLOTS,
    /\{meta \? \([\s\S]*?\{leading && !flushConditionExpanded/,
    'flush unit rows paint condition before the photos button',
  );
});

test('Units explosion body does not mount Prebox overlay', () => {
  assert.doesNotMatch(EXPLOSION, /PreboxWizard|wizardOpen|RightPaneOverlay/);
  assert.match(PREBOX, /data-prebox-wizard=\{embedded \? ['"]embedded['"]/);
});

test('Embedded Prebox uses TabDisplay child segment + Macro FlushTerminalFooter', () => {
  assert.match(PREBOX, /TabDisplay/);
  // Child mode (One master · One per unit) under the Prebox Assets leaf —
  // nested grammar: segment, never underline (leaf owns the title).
  assert.match(PREBOX, /appearance="segment"/);
  assert.match(PREBOX, /One master label/);
  assert.match(PREBOX, /One label per unit/);
  assert.doesNotMatch(
    PREBOX,
    /ds-raw-button[\s\S]{0,200}One master label/,
    'prebox mode must not be hand-rolled ds-raw-button pills',
  );
  assert.doesNotMatch(PREBOX, /appearance="underline"/);
  // Embedded path skips the "Create prebox label" header (Prebox leaf names it).
  assert.match(PREBOX, /!embedded \? \(/);
  assert.match(PREBOX, /Create prebox label/);
  // Macro floor — always mounted via FlushTerminalFooter (Claim golden).
  assert.match(PREBOX, /FlushTerminalFooter/);
  assert.match(PREBOX, /layout="cluster"/);
  assert.match(PREBOX, /Seal \+ print master/);
  assert.match(PREBOX, /Print unit labels/);
  assert.match(PREBOX, /size="md"/);
  assert.doesNotMatch(
    PREBOX,
    /max-h-56/,
    'Prebox list must fill the column — no nested max-h-56 island',
  );
  assert.doesNotMatch(
    PREBOX,
    /variant="primary"[\s\S]{0,200}serials\.map/,
    'no primary text Button inside the serial row map (Micro ≠ Macro)',
  );
});

test('UnitsDisplayHost fills the Displays column and stays edge-to-edge', () => {
  assert.match(HOST, /flex h-full min-h-0 flex-col/);
  assert.match(HOST, /px-0/);
  assert.doesNotMatch(HOST, /DISPLAYS_BODY_INSET/);
});

test('Units Displays feed shows in-row condition with flush expand pairing', () => {
  assert.doesNotMatch(
    EXPLOSION,
    /hideCondition/,
    'Units explosion must not hide condition — durable grading lives here',
  );
  assert.match(EXPLOSION, /Units · serials/);
  assert.match(EXPLOSION, /\bflush\b/);
  assert.match(EXPLOSION, /activeRowLeading=\{itemCamera\}/);
  assert.doesNotMatch(EXPLOSION, /Units · condition · serials/);
  // Flush expand pairing: condition expand collapses photo + serial.
  assert.match(UNIT_ROWS, /collapsible=\{stationCompact \|\| flush/);
  assert.match(UNIT_ROWS, /pairing\?\.expanded/);
  assert.match(UNIT_ROWS, /pairing\?\.onExpandedChange/);
  // Line-level add-serial field sits above the unit rows (next empty slot).
  assert.match(UNIT_ROWS, /data-units-line-serial-adder/);
  assert.match(UNIT_ROWS, /submitLineScan/);
  const SLOTS = code(sourceOf('./UnitSlotList.tsx'));
  assert.match(SLOTS, /flushConditionExpanded/);
  assert.match(SLOTS, /data-unit-slot-cond-expanded/);
  assert.match(SLOTS, /condExpanded/);
});

test('ConditionPills select-never-clear (no trailing clear, no re-click clear)', () => {
  assert.match(PILLS, /onChange\(g\.value\)/);
  assert.doesNotMatch(
    PILLS,
    /onChange\(\s*['"]{2}\s*\)/,
    'grade re-click never clears — select-never-clear',
  );
  assert.doesNotMatch(
    PILLS,
    /click again to clear/,
    'active tooltip must not invite clear-on-reselect',
  );
  assert.doesNotMatch(
    PILLS,
    /Clear condition|aria-label="Clear condition"/,
    'trailing clear control stays removed',
  );
  // Flush joined row: no gap / outer pad between grade faces.
  assert.match(PILLS, /gap-0/);
  assert.doesNotMatch(
    PILLS,
    /gap-1\.5| -mx-1 |px-1 py-0/,
    'condition grade row must not float pills with gutters or outer pad',
  );
});

test('ConditionPills collapsible strip confirms by picking a grade (no trailing check)', () => {
  assert.doesNotMatch(
    PILLS,
    /Confirm condition/,
    'expanded collapsible strip must not expose a trailing confirm control',
  );
  assert.doesNotMatch(
    PILLS,
    /<Check\b/,
    'condition confirm is the pill click — never a Check button',
  );
  // Picking a grade collapses — same grammar as TestingStatusPills.
  assert.match(
    PILLS,
    /onChange\(g\.value\);\s*if \(collapsible\) setExpanded\(false\)/,
    'picking a grade must confirm and collapse the strip',
  );
});

test('Capture row condition strip uses full labels + barDistribute (no left-clump)', () => {
  const CAPTURE = code(sourceOf('./line-edit/PoLineCaptureRow.tsx'));
  // Condition owns the full width in SoT names on the capture face.
  assert.match(
    CAPTURE,
    /labelVariant="full"/,
    'capture row must request conditionLabel full names',
  );
  assert.match(
    CAPTURE,
    /layout="barDistribute"/,
    'capture row must distribute grades across the full bar',
  );
  // ConditionPills scopes the layout; defaults stay pill + scroll for Units.
  assert.match(PILLS, /labelVariant = ["']pill["']/);
  assert.match(PILLS, /layout = ["']scroll["']/);
  assert.match(
    PILLS,
    /conditionOptions\(labelVariant\)/,
    'expanded strip labels must come from conditionOptions SoT — no local map',
  );
  assert.match(
    PILLS,
    /justify-between overflow-hidden/,
    'barDistribute radiogroup must justify-between (no left-clump dead air)',
  );
  // Density SoT: flush p-0 + flex-1 grade cells (no trailing confirm cell).
  const TONE = code(sourceOf('../../../lib/condition-tone.ts'));
  assert.match(
    TONE,
    /barDistribute[\s\S]{0,300}flex-1[\s\S]{0,200}p-0/,
    'barDistribute density must be flex-1 flush (p-0) — not padded pills',
  );
  assert.match(PILLS, /h-11 w-11 shrink-0/);
});

test('Condition grade pills are square-flush (not rounded-full sausages)', () => {
  const TONE = code(sourceOf('../../../lib/condition-tone.ts'));
  assert.match(TONE, /function conditionPillClass/);
  assert.match(TONE, /rounded-none/);
  // Expanded segments match Tags / image cell height (h-11), not a shorter
  // floated h-9 face with top/bottom air inside the joined bar.
  assert.match(
    TONE,
    /conditionPillClass[\s\S]{0,800}inline-flex h-11/,
    'expanded condition pills must be h-11 flush with the joined scan bar',
  );
  assert.doesNotMatch(
    TONE,
    /conditionPillClass[\s\S]{0,800}inline-flex h-9/,
    'condition pills must not shrink to h-9 inside an h-11 bar',
  );
  assert.doesNotMatch(
    TONE,
    /conditionPillClass[\s\S]{0,600}rounded-full/,
    'condition picker pills must be square — not rounded-full',
  );
});

test('ReceivingUnitRows does not re-inherit line grade after a cleared unit row', () => {
  assert.match(UNIT_ROWS, /units\?\.\[index\] != null/);
  assert.match(UNIT_ROWS, /return units\[index\]\.condition_grade \?\? null/);
});

test('Units explosion forces per-serial unit rows (not SerialCard chips)', () => {
  assert.match(
    EXPLOSION,
    /forceUnitRows/,
    'UnitsExplosionDisplay must pass forceUnitRows so each serial is an editable row',
  );
  const ACTIVE = code(sourceOf('./line-edit/ActiveLineConditionSerial.tsx'));
  assert.match(
    ACTIVE,
    /forceUnitRows,/,
    'ActiveLineConditionSerial must report forceUnitRows to resolveCaptureEntry',
  );
  assert.match(
    ACTIVE,
    /isMultiQty = mode === 'unit-rows'/,
    'the ReceivingUnitRows branch is the resolver answer, not a local qty check',
  );
  const SLOTS = code(sourceOf('./UnitSlotList.tsx'));
  assert.match(
    SLOTS,
    /overflowSerials/,
    'UnitSlotList must append overflow serials beyond materialised unit count',
  );
  assert.match(
    SLOTS,
    /flush[\s\S]{0,120}liveSaved/,
    'flush Units explosion must list one row per live serial (delete removes the row)',
  );
  assert.match(
    SLOTS,
    /flag !== ["']removing["']/,
    'in-flight deletes must drop the row immediately',
  );
});

test('Units flush serial bars are edge-to-edge (no outer px-3 around joined cells)', () => {
  const SLOTS = code(sourceOf('./UnitSlotList.tsx'));
  const ACTIVE = code(sourceOf('./line-edit/ActiveLineConditionSerial.tsx'));
  const NOSERIAL = code(sourceOf('./line-edit/NoSerialControl.tsx'));
  // Flush row shell: px-0 py-0 — not the soft inset that floated the green check.
  assert.match(SLOTS, /flush \? ["']px-0 py-0["']/);
  assert.doesNotMatch(
    SLOTS,
    /flush \? ["']px-3 py-2\.5["']/,
    'flush UnitSlotList rows must not pad the joined bar away from the column edge',
  );
  assert.match(UNIT_ROWS, /flush \? ['"]px-0 py-0['"]/);
  assert.match(ACTIVE, /variant="check"/);
  assert.match(ACTIVE, /appearance="flush"/);
  // Check variant defaults to flush so all-units offer is square on the scan floor.
  assert.match(NOSERIAL, /appearance=\{\s*appearance \?\? ['"]flush['"]\s*\}/);
});

test('Units flush / stationCompact joined bars are border-0 (parent divide owns seams)', () => {
  const SLOTS = code(sourceOf('./UnitSlotList.tsx'));
  const SERIAL = code(sourceOf('./SerialCard.tsx'));
  const PILLS_SRC = code(sourceOf('./ConditionPills.tsx'));
  // Flush + stationCompact share border-0 — no box border inside divide-y.
  assert.match(SLOTS, /flush \|\| stationCompact[\s\S]{0,80}["']border-0["']/);
  assert.doesNotMatch(
    SLOTS,
    /flush[\s\S]{0,40}border border-border-hairline/,
    'flush joined shell must not frame itself with a hairline box',
  );
  // Embedded Serial: soft cell seams + top/bottom hairlines (omitBottomHairline
  // nests under a flush leading shell that owns border-y).
  assert.match(
    SERIAL,
    /divide-x divide-border-soft/,
    'embedded SerialCard must use soft divide-x cell seams (Units golden)',
  );
  assert.match(
    SERIAL,
    /border-y border-border-hairline/,
    'embedded SerialCard owns top+bottom hairlines unless nested in a leading shell',
  );
  assert.match(
    SERIAL,
    /omitBottomHairline/,
    'embedded SerialCard must yield horizontal hairlines to a flush leading shell',
  );
  const ACTIVE = code(sourceOf('./line-edit/ActiveLineConditionSerial.tsx'));
  assert.match(
    ACTIVE,
    /border-y border-border-hairline divide-x divide-border-soft/,
    'flush leading shell owns top+bottom hairlines + soft column seam',
  );
  assert.match(
    ACTIVE,
    /omitBottomHairline=\{Boolean\(flush && activeRowLeading\)\}/,
    'leading shell must suppress SerialCard bottom hairline (one seam)',
  );
  // Joined collapsed grade face: fill only — no inset ring vs divide-x.
  assert.match(
    PILLS_SRC,
    /COLLAPSED_ICON_BTN\s*=\s*\{[\s\S]*?rounded-none/,
    'collapsed grade faces (bar + header) must be square flush',
  );
  assert.doesNotMatch(
    PILLS_SRC,
    /COLLAPSED_ICON_BTN[\s\S]{0,400}ring-1 ring-inset/,
    'collapsed grade cell must not paint an inset ring against divide-x',
  );
});

test('Progressive Unbox uses PoLineUnitCaptureList for qty 1 and N (no !isMultiQty gate)', () => {
  const ACTIVE = code(sourceOf('./line-edit/ActiveLineConditionSerial.tsx'));
  const LIST = code(sourceOf('./line-edit/PoLineUnitCaptureList.tsx'));

  assert.match(
    ACTIVE,
    /PoLineUnitCaptureList/,
    'capture path must mount PoLineUnitCaptureList',
  );
  // THE gate is a pure resolver, not a local conjunction. This is the whole
  // point of the refactor: one answer, three reporters.
  assert.match(
    ACTIVE,
    /resolveCaptureEntry\(\{/,
    'ALS must resolve the capture gate, never compute it inline',
  );
  assert.doesNotMatch(
    ACTIVE,
    /dockOwnsCapture\s*&&/,
    'no local capture conjunction — resolveCaptureEntry owns it',
  );
  assert.doesNotMatch(
    ACTIVE,
    /!isMultiQty\s*&&/,
    'no !isMultiQty conjunction on the capture path',
  );

  assert.match(
    LIST,
    /<PoLineCaptureRow/,
    'unit capture list must mount PoLineCaptureRow',
  );
  assert.match(
    LIST,
    /data-po-line-unit-capture/,
    'unit capture list must expose a stable data hook for guards',
  );
  assert.match(
    LIST,
    /onAddSerial/,
    'capture face Serial expands in-row via onAddSerial',
  );
  assert.doesNotMatch(
    LIST,
    /onOpenSerial/,
    'Serial no longer opens Displays from the capture list',
  );
  assert.doesNotMatch(
    LIST,
    /captureRow/,
    'Unbox centre capture has no SerialCard captureRow',
  );
});

test('Unfound Unbox capture parity — dockOwnsCapture threads into ALS + ReturnScanCard', () => {
  const SHARED = code(sourceOf('./unmatched-items/unmatched-items-shared.ts'));
  const SURFACE = code(sourceOf('./unmatched-items/UnmatchedAccordionSurface.tsx'));
  const RETURN = code(sourceOf('./unmatched-items/ReturnScanCard.tsx'));
  const LINE_PO = code(sourceOf('./line-edit/LinePoItemsSection.tsx'));
  const SERIAL = code(sourceOf('./SerialCard.tsx'));

  assert.match(
    SHARED,
    /dockOwnsCapture\?:/,
    'unfound props must expose dockOwnsCapture',
  );
  assert.match(
    LINE_PO,
    /dockOwnsCapture=\{dockOwnsCapture\}/,
    'LinePoItemsSection must pass dockOwnsCapture into UnmatchedItemsSection',
  );
  assert.match(
    SURFACE,
    /dockOwnsCapture=\{dockOwnsCapture\}[\s\S]{0,80}isActiveLine=\{isActiveLine\}/,
    'lined unfound must report facts to ALS like matched — never a local &&',
  );
  assert.match(
    SURFACE,
    /autoFocusSerial=\{isActiveLine\}/,
    'unfound: controller-active line autofocuses centre serial (optimistic scan)',
  );
  assert.match(
    SURFACE,
    /autoCommitDefaultGrade=\{[\s\S]*?isActiveLine && !line\.condition_graded_at/,
    'ungraded active line stamps default USED_A on mount',
  );
  assert.match(
    SURFACE,
    /dockOwnsCapture=\{dockOwnsCapture\}/,
    'empty ReturnScanCard must receive dockOwnsCapture',
  );
  assert.match(
    RETURN,
    /<PoLineCaptureRow/,
    'ReturnScanCard must mount PoLineCaptureRow under Unbox',
  );
  assert.match(
    RETURN,
    /resolveCaptureEntry\(\{[\s\S]*lineId: null/,
    'the empty stub is a resolver answer (no line yet), not a local &&',
  );
  assert.doesNotMatch(
    SERIAL,
    /progressiveStage|data-progressive-|data-capture-row|captureRow/,
    'SerialCard no longer owns Unbox capture — progressive + captureRow retired',
  );
  assert.match(
    RETURN,
    /showPhotos=\{false\}/,
    'empty unfound stub hides Photos until a real line exists',
  );
  assert.doesNotMatch(
    RETURN,
    /onOpenPhotos/,
    'empty unfound stub must not open Displays for Photos',
  );
});

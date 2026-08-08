/**
 * Source guard: Unbox Units Displays body is flush, nested Units · Prebox
 * TabDisplay (not a RightPaneOverlay modal). Condition pills are square-flush
 * with re-click clear (no trailing clear control).
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
const EXPLOSION = code(sourceOf('./UnitsExplosionDisplay.tsx'));
const PILLS = code(sourceOf('./ConditionPills.tsx'));
const UNIT_ROWS = code(sourceOf('./ReceivingUnitRows.tsx'));
const PREBOX = code(sourceOf('../PreboxWizard.tsx'));
const SIDE = code(sourceOf('./line-edit/unbox-side-tabs.ts'));

test('Units tab mounts UnitsDisplayHost (nested Units · Prebox)', () => {
  const unitsBlock = TABS.match(/id:\s*'units'[\s\S]*?id:\s*'checklist'/);
  assert.ok(unitsBlock, 'units tab block present');
  assert.match(unitsBlock[0], /<UnitsDisplayHost/);
  assert.doesNotMatch(
    unitsBlock[0],
    /WorkspaceCard\s+variant=["']glass["']/,
    'Units Displays body must sit flush on the push column — no glass island',
  );
});

test('UnitsDisplayHost nests Units · Prebox via TabDisplay + unitsAction', () => {
  assert.match(HOST, /data-testid="unbox-units-display"/);
  assert.match(HOST, /TabDisplay/);
  assert.match(HOST, /id:\s*'prebox'/);
  assert.match(HOST, /<PreboxWizard[\s\S]*embedded/);
  assert.match(HOST, /<UnitsExplosionDisplay/);
  assert.match(SIDE, /UnboxUnitsAction/);
  assert.match(SIDE, /parseUnboxUnitsAction/);
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
  // Child mode (One master · One per unit) under Units · Prebox parent —
  // nested grammar: segment, never underline (parent owns underline).
  assert.match(PREBOX, /appearance="segment"/);
  assert.match(PREBOX, /One master label/);
  assert.match(PREBOX, /One label per unit/);
  assert.doesNotMatch(
    PREBOX,
    /ds-raw-button[\s\S]{0,200}One master label/,
    'prebox mode must not be hand-rolled ds-raw-button pills',
  );
  assert.doesNotMatch(PREBOX, /appearance="underline"/);
  // Embedded path skips the "Create prebox label" header (Units · Prebox names it).
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

test('ConditionPills clears selected grade on re-click (no trailing clear)', () => {
  assert.match(PILLS, /selected === g\.value/);
  assert.match(PILLS, /onChange\(""\)/);
  assert.doesNotMatch(
    PILLS,
    /Clear condition|aria-label="Clear condition"/,
    'trailing clear control removed — re-click active grade clears',
  );
  // Flush joined row: no gap / outer pad between grade faces.
  assert.match(PILLS, /gap-0/);
  assert.doesNotMatch(
    PILLS,
    /gap-1\.5| -mx-1 |px-1 py-0/,
    'condition grade row must not float pills with gutters or outer pad',
  );
});

test('ConditionPills collapsible strip confirms via trailing check (not auto-collapse on pick)', () => {
  assert.match(
    PILLS,
    /Confirm condition/,
    'expanded collapsible strip must expose a confirm control',
  );
  assert.match(PILLS, /setExpanded\(false\)/);
  // Grade pick must NOT collapse — only the trailing confirm closes the strip.
  assert.doesNotMatch(
    PILLS,
    /onChange\(g\.value\);\s*if \(collapsible\) setExpanded\(false\)/,
    'picking a grade must leave the strip open until confirm',
  );
});

test('Condition grade pills are square-flush (not rounded-full sausages)', () => {
  const TONE = code(sourceOf('../../../lib/condition-tone.ts'));
  assert.match(TONE, /function conditionPillClass/);
  assert.match(TONE, /rounded-none/);
  // Expanded segments match Tags / image cell height (h-11), not a shorter
  // floated h-9 face with top/bottom air inside the joined bar.
  assert.match(
    TONE,
    /conditionPillClass[\s\S]{0,500}inline-flex h-11/,
    'expanded condition pills must be h-11 flush with the joined scan bar',
  );
  assert.doesNotMatch(
    TONE,
    /conditionPillClass[\s\S]{0,500}inline-flex h-9/,
    'condition pills must not shrink to h-9 inside an h-11 bar',
  );
  assert.doesNotMatch(
    TONE,
    /conditionPillClass[\s\S]{0,400}rounded-full/,
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
    /forceUnitRows\s*\|\|\s*\(quantityExpected/,
    'ActiveLineConditionSerial must prefer ReceivingUnitRows when forceUnitRows',
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
  assert.match(
    SERIAL,
    /embedded[\s\S]{0,200}border-0[\s\S]{0,80}divide-x/,
    'embedded SerialCard must be border-0 with divide-x cell seams only',
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

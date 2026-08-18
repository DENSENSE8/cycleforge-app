/**
 * Source guard: multi-qty empty Serial rows get the green no-serial check
 * only when materialised `units` reach UnitSlotList. Pins the plumbing that
 * was dropping units (panel `row.units` instead of accordion SoT; serials-only
 * hydration overlay).
 *
 * Plan: docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §4 Phase 3 UI.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/per-unit-no-serial-ui.guard.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sourceOf(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    "utf8",
  );
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const TYPES = code(sourceOf("./po-lines-accordion-types.ts"));
const PO_LINE_ROW = code(sourceOf("./PoLineRow.tsx"));
const LINE_PO_ITEMS = code(sourceOf("./line-edit/LinePoItemsSection.tsx"));
const UNMATCHED = code(
  sourceOf("./unmatched-items/UnmatchedAccordionSurface.tsx"),
);
const PO_LINES_DATA = code(sourceOf("./hooks/usePoLinesData.ts"));
const LINE_SERIALS = code(sourceOf("./line-edit/hooks/useLineSerials.ts"));
const UNIT_ROWS = code(sourceOf("./ReceivingUnitRows.tsx"));
const UNIT_SLOTS = code(sourceOf("./UnitSlotList.tsx"));
const PUBLISH = code(sourceOf("../../../lib/queries/receiving-queries.ts"));

test("ActiveRowSlotContext carries line + units alongside serials", () => {
  assert.match(TYPES, /export interface ActiveRowSlotContext/);
  assert.match(TYPES, /line:\s*ReceivingLineRow/);
  assert.match(TYPES, /serials:\s*ActiveRowSerial\[\]/);
  assert.match(TYPES, /units:\s*ReceivingLineUnitView\[\]/);
});

test("PoLineRow passes line + units from the hydrated accordion into activeRowSlot", () => {
  assert.match(PO_LINE_ROW, /activeRowSlot\(\{[\s\S]*line,/);
  assert.match(PO_LINE_ROW, /activeRowSlot\(\{[\s\S]*units:\s*line\.units/);
  assert.match(PO_LINE_ROW, /serials:\s*line\.serials/);
});

test("PoLineRow mounts condition/serial bodies under every editable line", () => {
  // SKU→serial interleave: bodies are not gated on isActive alone.
  assert.doesNotMatch(
    PO_LINE_ROW,
    /!readOnly && isActive && \(activeRowSlot/,
    "must not keep the single-active-body gate — serials sit under each SKU",
  );
  assert.match(
    PO_LINE_ROW,
    /unitsChrome && !readOnly && activeRowSlot \?/,
    "every editable line mounts its body (no single-active / collapse gate)",
  );
  assert.doesNotMatch(
    PO_LINE_ROW,
    /activeCollapsed/,
    "the per-line collapse chevron is removed — bodies stay expanded (capture is in the bottom dock)",
  );
});

test("LinePoItemsSection feeds ActiveLineConditionSerial from slot line + units, not panel row", () => {
  // Slot may be gated (`unitsChrome && serialScan ? (…) : undefined`) — match
  // the destructure wherever it sits inside the activeRowSlot expression.
  assert.match(
    LINE_PO_ITEMS,
    /activeRowSlot=\{[\s\S]*?\(\{\s*serials,\s*units,\s*line\s*\}\)/,
  );
  assert.match(LINE_PO_ITEMS, /units=\{units\}/);
  assert.match(LINE_PO_ITEMS, /lineId=\{line\.id\}/);
  assert.match(LINE_PO_ITEMS, /enqueueSerial\(sn,\s*grade,\s*line\.id\)/);
  assert.doesNotMatch(
    LINE_PO_ITEMS,
    /units=\{row\.units/,
    "panel row.units is usually unhydrated table data — must not drive the green check",
  );
});

test("UnmatchedAccordionSurface also passes slot line + units into ActiveLineConditionSerial", () => {
  assert.match(
    UNMATCHED,
    /activeRowSlot=\{[\s\S]*?\(\{\s*serials,\s*units,\s*line\s*\}\)/,
  );
  assert.match(UNMATCHED, /units=\{units\}/);
  assert.match(UNMATCHED, /lineId=\{line\.id\}/);
  assert.match(UNMATCHED, /submitSerial\(sn,\s*grade,\s*line\.id\)/);
});

test("usePoLinesData overlays units from include=serials onto the siblings cache", () => {
  assert.match(PO_LINES_DATA, /units:\s*\(r\.units/);
  assert.match(PO_LINES_DATA, /units:\s*incoming\.units/);
  assert.match(PO_LINES_DATA, /prevUnits/);
});

test("useLineSerials refresh publishes units from the by-id include=serials response", () => {
  assert.match(
    LINE_SERIALS,
    /publishLineSerials\(\s*queryClient,[\s\S]*line\.serials\s*\?\?\s*\[\],\s*line\.units\s*\?\?\s*\[\],\s*\)/,
  );
});

test("publishLineSerials accepts optional units without wiping them on serial-only calls", () => {
  assert.match(PUBLISH, /export function publishLineSerials\(/);
  assert.match(PUBLISH, /units\?:/);
  assert.match(PUBLISH, /units !== undefined/);
});

test("PO-item multi-unit Station rows collapse edits into expandable condition pills", () => {
  assert.match(LINE_PO_ITEMS, /stationCompact/);
  assert.match(UNIT_ROWS, /stationCompact\s*\?\s*null/);
  assert.match(UNIT_ROWS, /serialEditTarget=\{stationCompact\s*\?\s*null/);
  // Collapsible ConditionPills (Tags square → expand grade row) — not a dead circle.
  assert.match(UNIT_ROWS, /collapsible=\{stationCompact \|\| flush \|\| pairing != null\}/);
  assert.match(UNIT_ROWS, /startCollapsed=\{stationCompact \|\| flush\}/);
  assert.match(UNIT_SLOTS, /data-unit-scanned-icon/);
  assert.match(UNIT_SLOTS, /ScanBarcode/);
  // Joined meta cell grows when pills expand (fixed w-11 clipped the row).
  // Flush expand pairing: conditional flex-1 when condition owns the bar.
  assert.match(UNIT_SLOTS, /min-w-11 shrink-0/);
  assert.match(UNIT_SLOTS, /flushConditionExpanded/);
  assert.match(UNIT_SLOTS, /min-w-0 flex-1/);
  assert.match(UNIT_SLOTS, /flex h-11 items-stretch \[&>\*\]:h-full/);
});

test("Joined / flush unit trailing actions stay square (no soft NoSerialOfferCheck island)", () => {
  // Per-row empty slot: flush when joined (singleRowExpanded || flush).
  assert.match(
    UNIT_SLOTS,
    /appearance=\{joined \? ["']flush["'] : ["']default["']\}/,
  );
  assert.match(UNIT_SLOTS, /flush \? ["']px-0 py-0["']/);
});

test("Unit floor serial CTA is emerald + neutral focus (no blue glow)", () => {
  const SERIAL = code(sourceOf("./SerialCard.tsx"));
  assert.match(UNIT_SLOTS, /tone=["']neutral["']/);
  assert.match(UNIT_SLOTS, /focus-visible:ring-border-strong\/20/);
  assert.match(UNIT_SLOTS, /bg-emerald-600/);
  assert.doesNotMatch(
    UNIT_SLOTS,
    /bg-blue-600/,
    "multi-qty add serial must match SerialCard emerald submit",
  );
  assert.match(SERIAL, /tone=\{embedded \? ['"]neutral['"] : ['"]blue['"]\}/);
  assert.match(SERIAL, /divide-x divide-border-soft/);
  assert.match(SERIAL, /border-y border-border-hairline/);
});

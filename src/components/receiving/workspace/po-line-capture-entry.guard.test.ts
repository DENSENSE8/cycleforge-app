/**
 * Source guards for the Unbox PO-line capture row.
 *
 * Two invariants:
 *
 *  1. ONE gate. `resolveCaptureEntry` owns whether a line mounts the capture
 *     face; surfaces report facts.
 *
 *  2. The row is INVARIANT. Rest = full ConditionPills + Serial/Photos
 *     segments; Serial open = leading Tags square (ConditionGradeCircle) +
 *     SerialScanField + Photos; Photos open = Tags + Serial + ItemPhotoCaptureStrip
 *     (dock Link | Upload | Send). Both expand in-row — never Displays.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/po-line-capture-entry.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WORKSPACE = path.join(process.cwd(), 'src/components/receiving/workspace');

const read = (rel: string) => readFileSync(path.join(WORKSPACE, rel), 'utf8');

/** Strip comments so prose about the old mechanism cannot fail a guard. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const CAPTURE_ROW = code(read('line-edit/PoLineCaptureRow.tsx'));
const SERIAL_CARD = code(read('SerialCard.tsx'));
const SERIAL_FIELD = code(read('SerialScanField.tsx'));
const CHROME = code(read('po-line-capture-chrome.ts'));
const UNIT_LIST = code(read('line-edit/PoLineUnitCaptureList.tsx'));
const LINE_PO = code(read('line-edit/LinePoItemsSection.tsx'));
const ACCORDION = code(read('PoLinesAccordion.tsx'));
const RETURN = code(read('unmatched-items/ReturnScanCard.tsx'));

test('the capture gate has exactly one owner', () => {
  const OWNER = path.join(WORKSPACE, 'line-receive-mode.ts');
  // Legacy active-line conjunction must not return as a local gate.
  const GATE = /dockOwnsCapture\s*&&\s*is[A-Z]/;
  const offenders = walk(WORKSPACE)
    .filter((file) => file !== OWNER)
    .filter((file) => GATE.test(code(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(process.cwd(), file));

  assert.deepEqual(
    offenders,
    [],
    `these surfaces compute the capture gate themselves — pass facts to resolveCaptureEntry instead:\n${offenders.join('\n')}`,
  );
});

test('`progressiveCapture` is gone from every prop surface', () => {
  const offenders = walk(WORKSPACE)
    .filter((file) => /progressiveCapture/.test(code(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(process.cwd(), file));

  assert.deepEqual(offenders, [], 'progressiveCapture is retired');
});

test('SerialCard no longer owns the Unbox capture row', () => {
  assert.doesNotMatch(
    SERIAL_CARD,
    /data-capture-row|captureRow|CAPTURE_SEGMENT_ORDER|openPanel/,
    'capture face left SerialCard — lives in PoLineCaptureRow',
  );
});

test('SerialCard and PoLineCaptureRow share SerialScanField', () => {
  assert.match(
    SERIAL_CARD,
    /from ['"]\.\/SerialScanField['"]/,
    'SerialCard composes the shared serial field leaf',
  );
  assert.match(
    CAPTURE_ROW,
    /from ['"]\.\.\/SerialScanField['"]/,
    'PoLineCaptureRow composes the shared serial field leaf',
  );
  assert.match(
    SERIAL_FIELD,
    /data-unbox-serial-input/,
    'SerialScanField owns the serial input SoT',
  );
});

test('the progressive stage machine stays deleted', () => {
  for (const marker of [
    'progressiveStage',
    'data-progressive-stage',
    'data-progressive-serial',
    'data-progressive-photos',
    'setSerialExpanded',
    'data-progressive-capture',
  ]) {
    assert.doesNotMatch(
      CAPTURE_ROW + UNIT_LIST + SERIAL_CARD,
      new RegExp(marker.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&')),
      `${marker} is part of the retired stage machine`,
    );
  }
});

test('the capture row mounts condition + both segments unconditionally', () => {
  assert.match(
    CAPTURE_ROW,
    /labelVariant="full"[\s\S]*?layout="barDistribute"/,
    'condition uses full labels + barDistribute',
  );
  assert.match(
    CAPTURE_ROW,
    /collapsible/,
    'condition is collapsible — Tags at rest, hover expands pills',
  );
  assert.match(
    CAPTURE_ROW,
    /startCollapsed/,
    'fresh scan mounts collapsed Tags (USED_A) + open serial',
  );
  assert.match(
    CAPTURE_ROW,
    /\{CAPTURE_SEGMENT_ORDER\.map\(segmentFor\)\}|segmentFor\('serial'\)/,
    'segments render from the fixed order token (rest + photos-open keep Serial)',
  );
  assert.deepEqual(
    [...CHROME.matchAll(/CAPTURE_SEGMENT_ORDER = \[([^\]]*)\]/g)].map((m) =>
      m[1].replace(/\s|'/g, ''),
    ),
    ['serial,photos'],
    'segment order is serial then photos — identity, then evidence',
  );
});

test('no capture segment is ever disabled by capture state', () => {
  const segment = CAPTURE_ROW.slice(
    CAPTURE_ROW.indexOf('const segmentFor'),
    CAPTURE_ROW.indexOf('const serialField'),
  );
  assert.ok(segment.length > 0, 'segment renderer must exist');
  // `disabled={disabled}` (parent readiness) is fine; never `disabled={serialDone}` etc.
  assert.doesNotMatch(
    segment,
    /disabled=\{[^}]*Done|disabled=\{[^}]*Active|disabled=\{true/,
    'a capture segment is reachable at all times — state is a readout, not a gate',
  );
});

test('the confirm check cannot return to the capture row', () => {
  assert.doesNotMatch(
    CAPTURE_ROW,
    /NoSerialControl|NoSerialOfferCheck/,
    'no-serial lives in SerialScanField — not a capture-row confirm check',
  );
});

test('Serial opens by default with collapsible Tags; Photos expands in-row', () => {
  assert.match(
    CAPTURE_ROW,
    /useState<'serial' \| 'photos' \| null>\('serial'\)/,
    'fresh scan mounts with serial panel open (optimistic)',
  );
  assert.match(
    CAPTURE_ROW,
    /CAPTURE_DEFAULT_GRADE = 'USED_A'/,
    'default grade face is Used — A',
  );
  assert.match(
    CAPTURE_ROW,
    /useState\(false\)/,
    'condition always starts collapsed',
  );
  assert.match(
    CAPTURE_ROW,
    /onRowMouseDown|onMouseDown=\{onRowMouseDown\}/,
    'clicking the capture row focuses serial',
  );
  assert.match(
    CAPTURE_ROW,
    /focusUnboxCaptureSerial/,
    'autofocus wins dock receiving-focus-scan races',
  );
  assert.match(
    CAPTURE_ROW,
    /const showSerialField = serialOpen && !condExpanded/,
    'condition expand swaps serial field for the compact Serial icon',
  );
  assert.match(
    CAPTURE_ROW,
    /const showPhotosStrip = photosOpen && !condExpanded/,
    'condition expand keeps Photos as the compact icon, not the strip',
  );
  assert.match(
    CAPTURE_ROW,
    /data-capture-segment/,
    'Serial / Photos icon segments stay in the row while pills expand',
  );
  assert.match(
    CAPTURE_ROW,
    /'serial' \| 'photos'/,
    'openPanel is mutual-exclusive serial | photos',
  );
  assert.match(
    CAPTURE_ROW,
    /ConditionPills/,
    'leading condition is ConditionPills (collapsible Tags)',
  );
  assert.doesNotMatch(
    CAPTURE_ROW,
    /ConditionBadge/,
    'capture badge is the Tags icon face, not text ConditionBadge',
  );
  assert.match(
    CAPTURE_ROW,
    /<SerialScanField/,
    'serial-open mounts the shared SerialScanField',
  );
  assert.match(
    CAPTURE_ROW,
    /ItemPhotoCaptureStrip/,
    'photos-open mounts the shared item dock strip',
  );
  assert.doesNotMatch(
    CAPTURE_ROW,
    /onOpenPhotosDisplay|onOpenPhotos\b/,
    'capture Photos must not route to Displays',
  );
  assert.doesNotMatch(
    CAPTURE_ROW,
    /onOpenSerial/,
    'Serial no longer routes to Displays via onOpenSerial',
  );
  assert.match(UNIT_LIST, /<PoLineCaptureRow/);
  assert.match(UNIT_LIST, /onAddSerial/);
  assert.doesNotMatch(UNIT_LIST, /captureRow|onOpenPhotos/);
});

test('ConditionPills select-never-clear — no clear-on-reselect', () => {
  const PILLS = code(read('ConditionPills.tsx'));
  // Pill click must not clear via onChange("") / onChange('').
  assert.doesNotMatch(
    PILLS,
    /onChange\(\s*['"]{2}\s*\)/,
    'pill click must not clear the grade — select-never-clear',
  );
  assert.doesNotMatch(
    PILLS,
    /click again to clear/,
    'active tooltip must not invite clear-on-reselect',
  );
  assert.match(
    PILLS,
    /onChange\(g\.value\)/,
    'every pill press commits that grade',
  );
  assert.match(
    PILLS,
    /onMouseEnter=\{scheduleHoverExpand\}|onMouseEnter=\{openStrip\}/,
    'collapsed Tags expands on hover',
  );
  assert.doesNotMatch(
    PILLS,
    /onMouseLeave=\{closeStrip\}/,
    'expanded pills stay open on mouse leave — only a grade pick collapses',
  );
});

test('condition pick advances capture row to serial', () => {
  assert.match(
    CAPTURE_ROW,
    /handleConditionPick/,
    'condition onChange goes through a named pick handler',
  );
  const pick = CAPTURE_ROW.slice(
    CAPTURE_ROW.indexOf('const handleConditionPick'),
    CAPTURE_ROW.indexOf('const serialOpen'),
  );
  assert.ok(pick.length > 0, 'handleConditionPick must exist');
  assert.match(
    pick,
    /onConditionChange\(grade\)/,
    'pick commits the grade',
  );
  assert.match(
    pick,
    /setCondExpanded\(false\)/,
    'pick collapses the condition road',
  );
  assert.match(
    pick,
    /openSerial\(\)/,
    'pick opens in-row serial on the same path (optimistic)',
  );
  assert.match(
    CAPTURE_ROW,
    /onChange=\{handleConditionPick\}/,
    'ConditionPills wires the advance handler, not bare onConditionChange',
  );
  assert.match(
    CAPTURE_ROW,
    /onCollapsedClick=\{/,
    'Tags/units face click arms serial (hover still expands grades)',
  );
  assert.match(
    CAPTURE_ROW,
    /onArmCapture\?\.|onArmCapture\?\(\)/,
    'openSerial / row arm promote sibling to controller before focus',
  );
  assert.match(
    CAPTURE_ROW,
    /autoFocusSerial \|\| focusNonce > 0|!autoFocusSerial && focusNonce === 0/,
    'local openSerial focuses even when this row is not the controller',
  );
});

test('serial field owns ArrowUp/Down between PO-line capture rows', () => {
  assert.match(
    SERIAL_FIELD,
    /ArrowUp|ArrowDown/,
    'SerialScanField handles ↑/↓ while ambient cursor refuses-in-input',
  );
  assert.match(
    SERIAL_FIELD,
    /focusUnboxCaptureSerialRelative/,
    'arrow steps through the shared capture-serial focus SoT',
  );
  const FOCUS = code(read('line-edit/focus-unbox-capture-serial.ts'));
  assert.match(
    FOCUS,
    /focusUnboxCaptureSerialRelative/,
    'relative serial focus helper is the SoT',
  );
  assert.match(
    FOCUS,
    /focusUnboxCaptureSerialInLine/,
    'line-scoped serial focus used by qty click + sibling cursor',
  );
});

test('empty unfound stub shares in-row Serial; Photos waits for a line', () => {
  assert.match(RETURN, /<PoLineCaptureRow/);
  assert.match(RETURN, /onAddSerial/);
  assert.match(
    RETURN,
    /autoFocusSerial/,
    'empty stub autofocuses serial after PO/unfound scan',
  );
  assert.match(
    RETURN,
    /autoCommitDefaultGrade/,
    'empty stub stamps USED_A on mount',
  );
  assert.doesNotMatch(
    RETURN,
    /receiving-focus-scan/,
    'stub must not steal focus back to the dock wedge',
  );
  assert.match(
    RETURN,
    /showPhotos=\{false\}/,
    'stub has no receiving line id — item photo strip cannot mount yet',
  );
  assert.doesNotMatch(
    RETURN,
    /onOpenPhotos/,
    'stub must not open Displays for Photos',
  );
});

test('every editable Unbox line mounts capture — no active-only early return', () => {
  assert.doesNotMatch(
    LINE_PO,
    /dockOwnsCapture && line\.id !== row\.id\) return null/,
    'sibling lines must mount the capture face',
  );
});

test('PO line list snaps — no layout tween on capture mount', () => {
  assert.match(
    ACCORDION,
    /animateLayout=\{false\}/,
    'under-row capture mount must snap, not layout-tween',
  );
});

test('segment faces resolve from the token, and Photos reuses the identity blue', () => {
  assert.match(
    CHROME,
    /PO_LINE_CAPTURE_SERIAL_CLASS =\s*'bg-emerald-50 text-emerald-700/,
    'serial wears the green add/commit plate',
  );
  assert.match(
    CHROME,
    /PO_LINE_CAPTURE_PHOTOS_CLASS = STATION_CONTEXT_PHOTO_TONE/,
    'photos reuses the carton identity Photos tone verbatim',
  );
  assert.doesNotMatch(
    CHROME,
    /PO_LINE_CAPTURE_PHOTOS_CLASS =\s*'/,
    'photos must reference the shared tone, never re-type a blue',
  );
  assert.match(
    CAPTURE_ROW,
    /className=\{captureSegmentClass\(\{ key, open: false \}\)\}/,
    'both segments resolve their face from the one token',
  );
});

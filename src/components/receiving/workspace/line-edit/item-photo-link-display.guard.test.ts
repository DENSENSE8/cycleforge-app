/**
 * Photos Displays → **Link** leaf — the exact-linkage attach surface that
 * replaced dock/item Link popovers.
 *
 * Contract:
 *   - lives in the rail as a `?photoAction=link` drill (never a popover);
 *   - "Link to" covers carton aspects (Shipping label · The box · Packing
 *     material) + PO items; "Link as" only when Link to is a PO item;
 *   - the shared {@link PhotoAttachGrid} below;
 *   - commit branches: claim-stage (door aspects) · aspect PATCH (packing
 *     material) · reassign (+ optional aspect) for PO items;
 *   - deep strip / Arrival · carton dock reach it via `receiving-open-photo-link`.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/item-photo-link-display.guard.test.ts`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/receiving/workspace/line-edit');
const DISPLAY = readFileSync(join(ROOT, 'PhotoLinkDisplay.tsx'), 'utf8');
const HOST = readFileSync(join(ROOT, 'PhotosDisplayHost.tsx'), 'utf8');
const ARMED = readFileSync(join(ROOT, 'PhotosActionsArmedList.tsx'), 'utf8');
const STRIP = readFileSync(join(ROOT, 'ItemPhotoCaptureStrip.tsx'), 'utf8');
const ARRIVAL_DOCK = readFileSync(
  join(ROOT, 'steps/dock/ArrivalPhotosDockControl.tsx'),
  'utf8',
);
const CARTON_DOCK = readFileSync(
  join(ROOT, 'steps/dock/CartonPhotoDockControl.tsx'),
  'utf8',
);
const SIDE_TABS = readFileSync(join(ROOT, 'unbox-side-tabs.ts'), 'utf8');

describe('PhotoLinkDisplay — exact-linkage attach leaf', () => {
  it('Link to covers carton aspects + PO items; Link as is item-only', () => {
    assert.match(DISPLAY, /SearchableSelectField/, 'has Link to combobox');
    assert.match(DISPLAY, /Link to/, '"Link to" target selector');
    assert.match(DISPLAY, /Link as/, '"Link as" aspect selector');
    assert.match(
      DISPLAY,
      /CARTON_LINK_ASPECTS|shipping_label[\s\S]*box_exterior[\s\S]*packing_material/,
      '"Link to" includes carton aspects',
    );
    assert.match(
      DISPLAY,
      /group:\s*'Carton'/,
      'carton options are grouped under Carton',
    );
    assert.match(
      DISPLAY,
      /group:\s*'Items'/,
      'PO lines are grouped under Items',
    );
    assert.match(
      DISPLAY,
      /ASPECTS_BY_STAGE\.unbox_item/,
      '"Link as" options are the unbox_item aspects',
    );
    assert.match(
      DISPLAY,
      /receiving-lines\?receiving_id=/,
      '"Link to" items are the carton PO lines',
    );
    assert.match(
      DISPLAY,
      /isItemTarget/,
      'Link as mounts only when Link to is a PO item',
    );
  });

  it('composes the shared attach grid and branches commit by target kind', () => {
    assert.match(DISPLAY, /PhotoAttachGrid/, 'the grid is the shared attach primitive');
    assert.match(DISPLAY, /reassignPhotoToReceivingLine/, 'item commit reassigns onto the chosen line');
    assert.match(
      DISPLAY,
      /\/api\/photos\/\$\{photoId\}\/claim-stage/,
      'door carton aspects post claim-stage',
    );
    assert.match(
      DISPLAY,
      /\/api\/photos\/\$\{photoId\}\/aspect/,
      'packing material / Link as stamp aspect',
    );
    assert.match(
      DISPLAY,
      /data-testid="unbox-photo-link-display"/,
      'distinguishable for tests',
    );
  });

  it('is a rail drill, never a popover', () => {
    assert.doesNotMatch(DISPLAY, /<Popover\b/, 'no popover');
  });
});

describe('Wiring — Photos leaf link drill + event entry', () => {
  it('link is a first-class photo action, ordered after actions', () => {
    assert.match(
      SIDE_TABS,
      /'actions',\s*'link'/,
      'UNBOX_PHOTO_ACTION_ORDER puts link right after actions',
    );
    assert.match(
      SIDE_TABS,
      /UnboxPhotoAction =[^\n]*'link'/,
      'link is a member of UnboxPhotoAction',
    );
  });

  it('PhotosDisplayHost renders the link drill and threads the target handoff', () => {
    assert.match(HOST, /PhotoLinkDisplay/, 'host mounts the link leaf');
    assert.match(HOST, /verb === 'link'/, 'link is a drill verb');
    assert.match(HOST, /linkTargetLineId/, 'default PO-item "Link to" is threaded in');
    assert.match(
      HOST,
      /linkTargetCartonAspect/,
      'default carton-aspect "Link to" is threaded in',
    );
  });

  it('the Photos Actions list exposes a Link verb', () => {
    assert.match(ARMED, /onOpenLink/, 'Link is an armed verb callback');
    assert.match(ARMED, /Link a photo/, 'Link a photo row label');
  });

  it('the deep strip opens the leaf via event, not a popover', () => {
    assert.match(
      STRIP,
      /emitReceiving\('receiving-open-photo-link'/,
      'strip Link emits the open-photo-link event',
    );
    assert.doesNotMatch(STRIP, /<Popover\b|CartonPhotoPairPanel/, 'no popover / pair panel in the strip');
  });

  it('Arrival + carton dock Link open the rail leaf, not a popover', () => {
    assert.match(
      ARRIVAL_DOCK,
      /emitReceiving\('receiving-open-photo-link'/,
      'arrival Link emits open-photo-link',
    );
    assert.match(
      ARRIVAL_DOCK,
      /cartonAspect:\s*aspect/,
      'arrival Link preselects the door step aspect',
    );
    assert.doesNotMatch(
      ARRIVAL_DOCK,
      /CartonPhotoPairPanel|<Popover\b/,
      'arrival Link is a rail drill, not a popover',
    );
    assert.match(
      CARTON_DOCK,
      /emitReceiving\('receiving-open-photo-link'/,
      'carton Link emits open-photo-link',
    );
    assert.match(
      CARTON_DOCK,
      /cartonAspect:\s*aspect/,
      'carton Link preselects the bench step aspect',
    );
    assert.doesNotMatch(
      CARTON_DOCK,
      /CartonPhotoPairPanel|<Popover\b/,
      'carton Link is a rail drill, not a popover',
    );
  });
});

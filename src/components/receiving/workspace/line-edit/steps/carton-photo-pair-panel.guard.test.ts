/**
 * Arrival Link must claim from carton evidence — never empty-state on a
 * package-only list while chrome Photos shows N. Arrival UX is claim-picker
 * chrome (density + select-all) → select → sticky Check → claim-stage.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/steps/carton-photo-pair-panel.guard.test.ts`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/receiving/workspace/line-edit/steps');
const PANEL = readFileSync(join(ROOT, 'CartonPhotoPairPanel.tsx'), 'utf8');
const DOCK = readFileSync(join(ROOT, 'dock/ArrivalPhotosDockControl.tsx'), 'utf8');

describe('CartonPhotoPairPanel — Arrival claim vs bench pair', () => {
  it('Arrival lists carton intent, not package-only', () => {
    assert.match(
      PANEL,
      /RECEIVING_PHOTO_LIST_INTENT_CARTON/,
      'Arrival must list whole carton evidence (chrome Photos parity)',
    );
    assert.match(
      PANEL,
      /isDoor \? RECEIVING_PHOTO_LIST_INTENT_CARTON : photoIntentFromStage/,
      'bench stays stage-scoped; Arrival broadens to carton',
    );
  });

  it('Arrival claim writes claim-stage via sticky Check, never reassign or instant tile claim', () => {
    assert.match(
      PANEL,
      /\/api\/photos\/\$\{photoId\}\/claim-stage/,
      'cross-stage door claim must hit the claim-stage route',
    );
    assert.match(
      PANEL,
      /data-arrival-claim-grid/,
      'Arrival Link is a scrollable photo grid',
    );
    assert.match(
      PANEL,
      /data-arrival-claim-tile/,
      'tiles are selection targets',
    );
    assert.match(
      PANEL,
      /PhotoGridDisplayControls/,
      'claim-style density sizes live in the header',
    );
    assert.match(
      PANEL,
      /SelectionMark/,
      'tiles use SelectionMark, not instant claim-on-tap',
    );
    assert.match(
      PANEL,
      /data-arrival-select-all/,
      'select-all Pencil matches claim picker',
    );
    assert.match(
      PANEL,
      /FlushTerminalFooter/,
      'sticky Check footer posts the claim',
    );
    assert.match(
      PANEL,
      /data-arrival-claim-check/,
      'Check CTA is the post verb',
    );
    assert.doesNotMatch(
      PANEL,
      /\/api\/photos\/[^`'"]+\/reassign/,
      'same-carton stage claim must not abuse entity reassign',
    );
    assert.doesNotMatch(
      PANEL,
      />Label<|>Exterior</,
      'no per-row Label / Exterior buttons — the header names the step',
    );
    assert.doesNotMatch(
      PANEL,
      /['"]Carton photo['"]/,
      'no redundant Carton photo row label under the step header',
    );
  });

  it('Arrival basis order is label then box', () => {
    assert.match(
      PANEL,
      /nextDoorClaimAspect|DOOR_CLAIM_ORDER/,
      'claim target walks ASPECTS_BY_STAGE.arrival_package order',
    );
    const orderIdx = PANEL.indexOf('ASPECTS_BY_STAGE.arrival_package');
    assert.ok(orderIdx >= 0, 'Arrival claim order reads door aspect SoT');
  });

  it('bench within-stage pair still uses aspect PATCH', () => {
    assert.match(
      PANEL,
      /\/api\/photos\/\$\{photoId\}\/aspect/,
      'within-stage naming stays on the aspect route',
    );
  });

  it('dock toasts success and advances after Check', () => {
    assert.match(DOCK, /toast\.success/, 'mouse confirmation is a bottom-right toast');
    assert.match(DOCK, /focusStep/, 'procedure advances after a successful link');
    assert.match(DOCK, /nextNeighbour/, 'advance targets the next procedure neighbour');
    assert.match(
      DOCK,
      /Label photo linked|Box photo linked/,
      'toast copy is step-contextual',
    );
  });
});

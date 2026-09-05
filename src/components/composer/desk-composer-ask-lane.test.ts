/**
 * Tripwire: desk Ask is StationComposerHost at the page foot, not a FAB.
 *
 * Run: node --import tsx --test src/components/composer/desk-composer-ask-lane.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('DeskComposerAskLane is StationComposerHost + ComposerAskStage, not a FAB', () => {
  const src = readFileSync(path.join(HERE, 'DeskComposerAskLane.tsx'), 'utf8');
  const host = readFileSync(path.join(HERE, 'StationComposerHost.tsx'), 'utf8');
  assert.match(src, /StationComposerHost/);
  assert.match(src, /presenceKind="desk"/);
  assert.match(host, /ComposerAskStage/);
  assert.match(host, /presenceKind === 'desk'/);
  assert.match(src, /useDeskField/);
  assert.doesNotMatch(src, /AssistantFabHost/);
  assert.doesNotMatch(src, /<textarea\b/);
  assert.doesNotMatch(src, /OmnichannelComposerDock/);
});

test('ContextPanelLayout and MobileRouteShell mount the desk Ask lane', () => {
  const layout = readFileSync(
    path.join(HERE, '../sidebar/ContextPanelLayout.tsx'),
    'utf8',
  );
  const mobile = readFileSync(
    path.join(HERE, '../layout/MobileRouteShell.tsx'),
    'utf8',
  );
  assert.match(layout, /DeskComposerAskLane/);
  assert.match(mobile, /DeskComposerAskLane/);
});

test('the shell publishes ONE lead pane and every desk chrome takes it', () => {
  const shell = readFileSync(
    path.join(HERE, '../layout/ResponsiveLayout.tsx'),
    'utf8',
  );
  const chrome = readFileSync(
    path.join(HERE, '../../design-system/components/DeskPageChrome.tsx'),
    'utf8',
  );
  const desk = readFileSync(
    path.join(HERE, '../desk/DeskPageLayout.tsx'),
    'utf8',
  );

  // Published once, above ContextPanelLayout — that component returns early for
  // rail-less surfaces (the whole Shipping desk), and the mouth belongs to the
  // desk frame, not to the rail.
  assert.match(shell, /DeskLeadPaneProvider/);
  assert.match(shell, /variant="page-column"/);

  // Taken by the frame, so a desk cannot be the one that forgot to pass it.
  assert.match(chrome, /useDeskLeadPane/);
  assert.match(chrome, /DESK_LEAD_PANE_WIDTH_CLASS/);
  assert.match(chrome, /DESK_LEAD_PANE_BODY_CLASS/);
  assert.doesNotMatch(desk, /leadPane/);

  const src = readFileSync(path.join(HERE, 'DeskComposerAskLane.tsx'), 'utf8');
  assert.match(src, /DESK_ASK_PANE_TITLE = 'Ask'/);
  // One screen, one mouth: the foot dock stands down while a column is up.
  assert.match(src, /registerDeskLeadPaneMouth/);
  assert.match(src, /useStationComposerDeskCount/);
  // The lane paints the MOUTH only — no second header row, no second card.
  assert.doesNotMatch(src, /DESK_PAGE_HEADER_ROW_CLASS/);
  assert.doesNotMatch(src, /DESK_CHROME_STAGE_BODY_CLASS/);
  assert.doesNotMatch(src, /DESK_TAB_ROW_CLASS/);
  assert.doesNotMatch(src, /mode !== 'ask'/);
});

test('Home Tasks Staff face is modeRowLeading, not a new STATION_COMPOSER_MODES id', () => {
  const src = readFileSync(path.join(HERE, 'DeskComposerAskLane.tsx'), 'utf8');
  assert.match(src, /modeRowLeading=\{staffFace\}/);
  assert.match(src, /data-testid="composer-mode-staff"/);
  assert.match(src, /mentionTokens/);
  assert.match(src, /PROJECT_TASK_MIME/);
  assert.match(src, /showModeFaces=\{false\}/);
});

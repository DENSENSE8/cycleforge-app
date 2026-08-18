/**
 * Arrival Station wiring — ScanInput bottom dock, classify host, photo handoff.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

describe('MobileArrivalStation contract', () => {
  const station = readFileSync(
    join(root, 'src/components/mobile/receiving/MobileArrivalStation.tsx'),
    'utf8',
  );
  const page = readFileSync(join(root, 'src/app/m/(shell)/triage/page.tsx'), 'utf8');
  const classify = readFileSync(
    join(root, 'src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx'),
    'utf8',
  );
  const scanInput = readFileSync(
    join(root, 'src/components/mobile/redesign/ScanInput.tsx'),
    'utf8',
  );
  const drawer = readFileSync(
    join(root, 'src/components/mobile/redesign/MobileSidebarDrawer.tsx'),
    'utf8',
  );
  const list = readFileSync(
    join(root, 'src/components/mobile/receiving/MobileReceivingList.tsx'),
    'utf8',
  );
  const proxy = readFileSync(join(root, 'src/proxy.ts'), 'utf8');

  it('triage page mounts MobileArrivalStation', () => {
    assert.match(page, /MobileArrivalStation/);
    assert.ok(!page.includes('RedesignedMobileReceive'));
  });

  it('uses ScanInput for the bottom scanner', () => {
    assert.ok(station.includes("from '@/components/mobile/redesign/ScanInput'"));
    assert.ok(station.includes('<ScanInput'));
    assert.match(station, /prominentCamera/);
    assert.doesNotMatch(station, />\s*Scan tracking\s*</);
  });

  it('does not autoFocus the dock field (OS paste callout under the thumb)', () => {
    assert.doesNotMatch(station, /\n\s*autoFocus\s*\n/);
  });

  it('prominentCamera matches leading barcode size, blue, right-slot', () => {
    assert.match(scanInput, /data-scan-camera=\{prominentCamera \? 'prominent'/);
    assert.match(scanInput, /text-blue-600/);
    assert.match(scanInput, /STATION_SCAN_BAR_DEFAULT_ICON_CLASS/);
    assert.match(scanInput, /STATION_SCAN_BAR_RIGHT_CELL/);
    assert.doesNotMatch(scanInput, /h-11 w-11/);
    assert.match(scanInput, /rightContent=\{/);
  });

  it('arrival dock is edge-to-edge integrated scan band with clearance', () => {
    // `pb-9` matches the canonical station scan bar's PRIMARY_CHROME_ROW_FACE.
    assert.match(station, /pb-9/);
    assert.match(station, /pb-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/);
    assert.doesNotMatch(station, /rounded-2xl border border-border-soft/);
    assert.doesNotMatch(station, /\bpy-1\.5\b/);
    assert.match(station, /inset-x-0 bottom-0/);
  });

  it('uses the authoritative mobile recent-arrivals list', () => {
    assert.match(station, /MobileReceivingList/);
    assert.match(station, /surface="triage"/);
    assert.doesNotMatch(station, /ScanResultRow|SectionHeader|FILTERS/);
  });

  it('triage list rows resume photos→classify', () => {
    assert.match(list, /mobileArrivalPhotosThenClassifyHref/);
    assert.match(list, /surface !== 'triage'/);
  });

  it('triage row selection opens Arrival details sheet (platform · type · priority)', () => {
    assert.match(list, /MobileArrivalDetailsSheet/);
    assert.match(list, /surface === 'triage'/);
    const details = readFileSync(
      join(root, 'src/components/mobile/receiving/MobileArrivalDetailsSheet.tsx'),
      'utf8',
    );
    assert.match(details, /Platform/);
    assert.match(details, /Type/);
    assert.match(details, /Priority/);
    assert.match(details, /persistPlatform|source_platform/);
    assert.match(details, /intake_type/);
    assert.match(details, /priority_tier/);
  });

  it('hands off scan → photos then classify', () => {
    assert.match(station, /mobileArrivalPhotosThenClassifyHref/);
    assert.match(station, /intakeSurface: 'triage'/);
    assert.match(station, /localOnly: true/);
  });

  it('classify order is platform → type → priority', () => {
    assert.ok(classify.includes("goStep('type')"));
    assert.ok(classify.includes("goStep('priority')"));
    assert.match(classify, /ARRIVAL_CLASSIFY_STEPS/);
    assert.match(classify, /router\.replace\('\/m\/triage'\)/);
  });

  it('drawer labels the station Arrival', () => {
    assert.match(drawer, /label: 'Arrival'/);
    assert.match(drawer, /href: '\/m\/triage'/);
  });

  it('UA /triage rewrites to /m/triage', () => {
    assert.ok(proxy.includes("['/triage', '/m/triage']"));
    assert.ok(proxy.includes("['/triage/', '/m/triage']"));
  });
});
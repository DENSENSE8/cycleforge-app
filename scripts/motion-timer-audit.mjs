#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');
const STRICT = process.argv.includes('--strict');
const JSON_OUTPUT = process.argv.includes('--json');

const MOTION_IMPORT = /from\s+['"](?:motion\/react|@\/design-system\/motion(?:\/[^'"]*)?)['"]/;
const TIMER_CALL = /\bset(?:Timeout|Interval)\s*\(/;
const DIRECT_MOTION_PLUS = /from\s+['"](?:motion-plus(?:\/[^'"]*)?|@motionplus(?:\/[^'"]*)?)['"]/;

/**
 * A path appears here only after its timer was inspected. The note records the
 * timer's authority; new timer+motion intersections remain unreviewed even if
 * their filename resembles an existing surface.
 */
const REVIEWED_TIMERS = {
  'src/app/warehouse/rma/disposition/page.tsx': ['focus-handoff', 'next-task focus after lookup'],
  'src/components/boot/WelcomeAssembly.tsx': ['choreography', 'paced intro, holds, and hard safety cap'],
  'src/components/boot/WelcomeSimple.tsx': ['choreography', 'paced welcome sequence'],
  'src/components/demo/MotionPlusButtonDemo.tsx': ['demo', 'demo-only phase clock; production primitive owns no timer'],
  'src/components/fba/sidebar/FbaFnskuScanToast.tsx': ['acknowledgement', 'scan acknowledgement lifetime'],
  'src/components/forge/TicketStatusChip.tsx': ['acknowledgement', 'status-change acknowledgement lifetime'],
  'src/components/layout/DesktopRouteShell.tsx': ['focus-handoff', 'post-layout focus handoff'],
  'src/components/layout/GlobalHeaderAdd.tsx': ['interaction-lifetime', 'two-step keyboard arming window'],
  'src/components/layout/GlobalHeaderSync.tsx': ['interaction-lifetime', 'two-step keyboard arming window'],
  'src/components/mobile/redesign/ItemCardRow.tsx': ['direct-manipulation', 'release cleanup after drag settles'],
  'src/components/mobile/ScanSurface.tsx': ['mixed-lifecycle', 'scan acknowledgement and expanded-input focus'],
  'src/components/mobile/station/MobilePackerSpamCamera.tsx': ['acknowledgement', 'camera flash lifetime'],
  'src/components/mobile/station/MobileStationShell.tsx': ['time-or-cooldown', 'visible station clock tick'],
  'src/components/mobile/station/MobileSwipePhotoViewer.tsx': ['interaction-lifetime', 'destructive-action arming window'],
  'src/components/receiving/workspace/LineEditPanel.tsx': ['focus-handoff', 'post-layout editor focus'],
  'src/components/receiving/workspace/PoLineRow.tsx': ['mixed-lifecycle', 'row pulse acknowledgement and scan-focus handoff'],
  'src/components/receiving/workspace/ReceiveFeedbackRegion.tsx': ['acknowledgement', 'receive-result feedback lifetime'],
  'src/components/receiving/workspace/WeldedFeedbackPanel.tsx': ['acknowledgement', 'feedback panel lifetime'],
  'src/components/receiving/workspace/line-edit/CartonMatchHub.tsx': ['focus-handoff', 'scan focus after panel mutation'],
  'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx': ['mixed-lifecycle', 'lookup debounce and success hold'],
  'src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx': ['interaction-lifetime', 'hover preview lifetime'],
  'src/components/session/AgentSessionPanel.tsx': ['time-or-cooldown', 'server cooldown tick and connection-prompt lifetime'],
  'src/components/session/artifacts/InlineArtifact.tsx': ['acknowledgement', 'copied acknowledgement lifetime'],
  'src/components/session/composer/ContextUsageRing.tsx': ['interaction-lifetime', 'hover disclosure delay'],
  'src/components/sidebar/SidebarNavColumn.tsx': ['deferred-render', 'idle fallback for lazy sidebar mount'],
  'src/components/sidebar/contextual/NavGoKeys.tsx': ['interaction-lifetime', 'keyboard chord window'],
  'src/components/station/PackScanColumn.tsx': ['focus-handoff', 'restore scanner focus after work'],
  'src/components/station/scan-bar/ScanBandGlowHost.tsx': ['acknowledgement', 'scan glow lifetime'],
  'src/components/tech/shipping/ShippingCapturedUnits.tsx': ['acknowledgement', 'added/copied acknowledgement lifetime'],
  'src/components/ui/BottomSheet.tsx': ['interaction-lifetime', 'sheet gesture and dismissal lifetime'],
  'src/components/ui/HoverTooltip.tsx': ['interaction-lifetime', 'tooltip enter and leave delays'],
  'src/components/ui/card-fan-carousel.tsx': ['interaction-lifetime', 'hover-leave stabilization'],
  'src/design-system/ai/AiTurnActions.tsx': ['acknowledgement', 'copied/action acknowledgement lifetime'],
  'src/design-system/components/FindField.tsx': ['mixed-lifecycle', 'placeholder tour and input debounce'],
  'src/design-system/components/UniversalLoader.tsx': ['acknowledgement', 'loader label pacing'],
  'src/design-system/components/record-card/RecordCard.tsx': ['interaction-lifetime', 'hover-card enter and leave delays'],
  'src/features/home/DailyEntrance.tsx': ['choreography', 'one-time entrance pacing'],
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(absolute);
      return /\.[cm]?tsx?$/.test(entry.name) ? [absolute] : [];
    }),
  );
  return files.flat();
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function timerLines(source) {
  return source
    .split('\n')
    .map((line, index) => (TIMER_CALL.test(line) ? index + 1 : null))
    .filter((line) => line !== null);
}

function reviewFor(file) {
  const review = REVIEWED_TIMERS[file];
  return review
    ? { category: review[0], note: review[1], reviewed: true }
    : { category: 'unreviewed', note: 'inspect timer authority before approval', reviewed: false };
}

const files = await walk(SOURCE_ROOT);
const timerCoupled = [];
const directMotionPlus = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const name = relative(file);
  if (DIRECT_MOTION_PLUS.test(source) && name !== 'src/design-system/motion/plus.ts') {
    directMotionPlus.push(name);
  }
  if (MOTION_IMPORT.test(source) && TIMER_CALL.test(source)) {
    const review = reviewFor(name);
    timerCoupled.push({
      file: name,
      ...review,
      lines: timerLines(source),
    });
  }
}

timerCoupled.sort((a, b) => a.category.localeCompare(b.category) || a.file.localeCompare(b.file));
directMotionPlus.sort();

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ timerCoupled, directMotionPlus }, null, 2));
} else {
  console.log(`Motion timer audit: ${timerCoupled.length} timer-coupled motion modules`);
  let category = '';
  for (const finding of timerCoupled) {
    if (finding.category !== category) {
      category = finding.category;
      console.log(`\n${category}`);
    }
    console.log(`  ${finding.file}:${finding.lines.join(',')} — ${finding.note}`);
  }
  console.log(
    directMotionPlus.length === 0
      ? '\nMotion+ boundary: clean (all imports go through the design-system facade)'
      : `\nMotion+ boundary violations:\n  ${directMotionPlus.join('\n  ')}`,
  );
}

const unreviewed = timerCoupled.filter((finding) => !finding.reviewed);
if (directMotionPlus.length > 0 || (STRICT && unreviewed.length > 0)) process.exitCode = 1;

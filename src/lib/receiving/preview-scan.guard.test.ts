/**
 * Preview stance is READ-ONLY, and it is enforced at the wedge waist.
 *
 * Run: node --import tsx --test src/lib/receiving/preview-scan.guard.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Comment- and import-free source. These files DOCUMENT the writers they
 * deliberately avoid, so a naive substring scan flags its own rationale — the
 * guard would then only pass if the reasoning were deleted.
 */
const read = (p: string) =>
  raw(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^import[\s\S]*?from\s+'[^']+';$/gm, '');

test('the preview path writes NOTHING — no scan row, no unbox stamp, no carton', () => {
  for (const path of [
    'src/lib/receiving/preview-scan.ts',
    'src/lib/receiving/preview-scan-deps.ts',
    'src/app/api/receiving/preview-scan/route.ts',
  ]) {
    const src = read(path);
    for (const writer of [
      'recordReceivingScan',
      'recordUnboxScanOpened',
      'recordUnboxLookupScan',
      'stampUnboxOpened',
      'withTenantTransaction',
      'INSERT',
      'UPDATE ',
      'DELETE',
    ]) {
      assert.ok(
        !src.includes(writer),
        `${path} must not reach for ${writer} — a preview that writes is an unbox`,
      );
    }
  }
});

test('preview never routes through lookup-po (its reads carry writes)', () => {
  const src = read('src/lib/receiving/preview-scan-deps.ts');
  assert.ok(!src.includes('lookup-po'));
  // The two genuinely pure resolvers are the whole read half.
  assert.match(src, /resolveShipmentForScan/);
  assert.match(src, /resolveSupportTicketToReceiving/);
});

test('the global wedge honors Preview BEFORE routing or the action sink', () => {
  const src = read('src/hooks/useGlobalWedgeScanner.ts');
  assert.match(src, /isScanPreview\(\) && deliverScanToTarget\(value\)/);
  const guard = src.indexOf('isScanPreview()');
  const sink = src.indexOf('dispatchScanToActiveSink');
  const push = src.indexOf('router.push');
  assert.ok(guard > 0 && guard < sink, 'stance guard must precede the action sink');
  assert.ok(guard < push, 'stance guard must precede URL navigation');
});

test('Preview shares NO state with Scan — no face swap, no committed value', () => {
  const bar = read('src/components/station/scan-bar/StationScanBar.tsx');
  const run = bar.slice(bar.indexOf('const runPreview'), bar.indexOf('previewSubmitRef.current = runPreview'));
  for (const scanState of ['setCommittedValue', "setFace('display')", 'setScanKey']) {
    assert.ok(
      !run.includes(scanState),
      `runPreview must not touch ${scanState} — two stances sharing one piece of state IS the linkage`,
    );
  }
  const formClose = bar.lastIndexOf('</motion.form>');
  assert.ok(
    !bar.slice(formClose).includes('Preview'),
    'the band has no second row — nothing may render after the form',
  );
});

test('Preview can never become a Scan — neither stance drives the other', () => {
  const bar = read('src/components/station/scan-bar/StationScanBar.tsx');
  assert.ok(!bar.includes('promoteToScan'), 'promotion is deleted, not merely unreachable');
  const submit = bar.slice(bar.indexOf('const handleInternalSubmit'), bar.indexOf('}, [onSubmit, value'));
  const preview = submit.slice(submit.indexOf("getScanStance() === 'preview'"));
  const body = preview.slice(0, preview.indexOf('}'));
  assert.ok(!body.includes('onSubmit'), 'Enter in Preview re-previews; it never commits');
  assert.ok(!body.includes('setScanStance'), 'the bar never flips the operator\'s stance');

  // The lock band keeps Close only — no commit button, and no event for one.
  const lock = read('src/components/receiving/unbox/UnboxPreviewLock.tsx');
  assert.ok(!/onScanIt|Scan it/.test(lock), 'the lock band commits nothing');
  // Close is the band's ONLY control, and it is a dismiss: it may re-arm the
  // bench (stance → scan, bar cleared) but it must never submit or open.
  const panel = read('src/components/sidebar/ReceivingSidebarPanel.tsx');
  const onClose = panel.slice(panel.indexOf("'receiving-workspace-close'"));
  const closeBody = onClose.slice(0, onClose.indexOf("'receiving-submit-tracking'"));
  assert.match(closeBody, /setScanStance\('scan'\)/, 'leaving a preview re-arms Scan');
  assert.match(closeBody, /setBulkTracking\(''\)/, 'and clears the value, so no stray Enter commits it');
  assert.ok(
    !closeBody.includes('submitTrackingScan'),
    'closing a preview must never submit — that is the promotion constraint A bans',
  );
  const events = read('src/components/receiving/receiving-events.ts');
  assert.ok(
    !events.includes('receiving-preview-commit'),
    'the commit event is deleted, not merely unlistened',
  );
  assert.ok(!panel.includes('receiving-preview-commit'));

  // The ONE legitimate fork survives: a waist choosing which stance handles a
  // scan is not one stance driving the other.
  const wedge = read('src/hooks/useGlobalWedgeScanner.ts');
  assert.match(wedge, /isScanPreview\(\)/);
});

test('the band grows NO status row of its own — the pane is the only answer', () => {
  assert.ok(
    !existsSync(join(ROOT, 'src/components/station/scan-bar/StationScanPreviewCard.tsx')),
    'the in-band preview face is deleted, not merely unmounted',
  );
  assert.ok(
    !existsSync(join(ROOT, 'src/components/station/scan-bar/preview-classify.ts')),
    'classification existed only to compose bar copy — deleted with the copy',
  );
  const bar = read('src/components/station/scan-bar/StationScanBar.tsx');
  assert.ok(!bar.includes('previewResult'), 'no band state survives a preview');
  assert.ok(!bar.includes('classifyPreview'), 'the classify prop is gone with its three call sites');
});

test('the scan bar authors NO microcopy — value and chrome only, in either stance', () => {
  const bar = read('src/components/station/scan-bar/StationScanBar.tsx');
  for (const sentence of ['toast.', 'Nothing on file', 'Preview unavailable']) {
    assert.ok(
      !bar.includes(sentence),
      `the bar must not narrate (${sentence}) — the honest owner of a miss is the surface that would have opened`,
    );
  }
  for (const host of [
    'src/components/sidebar/receiving/ReceivingUnboxScanBar.tsx',
    'src/components/sidebar/receiving/TestingScanBar.tsx',
    'src/components/sidebar/tech/ShippingScanBar.tsx',
  ]) {
    const src = read(host);
    assert.ok(
      !/Preview:|would search/.test(src),
      `${host} must not name the stance in the field`,
    );
    assert.ok(!src.includes('classifyPreview'), `${host} must not classify for copy`);
  }
});

test('a type switch re-previews the value already on the bar', () => {
  const bar = read('src/components/station/scan-bar/StationScanBar.tsx');
  assert.match(bar, /lastPreviewModeRef/);
  assert.match(bar, /if \(!pending \|\| getScanStance\(\) !== 'preview'\) return;/);
  const unbox = read('src/components/sidebar/receiving/ReceivingUnboxScanBar.tsx');
  assert.match(unbox, /previewMode=\{armedMode \?\? 'auto'\}/);
});

test('a preview OPEN can never record a view — the two facts resolve together', () => {
  const shared = read('src/components/sidebar/receiving/receiving-sidebar-shared.ts');
  // `readSelectLineDetail` forces it rather than trusting each dispatcher.
  assert.match(shared, /recordView:\s*!preview\s*&&\s*detail\.recordView\s*!==\s*false/);

  const pane = read('src/components/receiving/unbox/UnboxLineWorkspace.tsx');
  assert.match(pane, /recordView=\{!workspace\.preview && workspace\.recordView !== false\}/);
});

test('the preview pane is INERT — a read-only stance that can be typed into is not read-only', () => {
  const pane = read('src/components/receiving/unbox/UnboxLineWorkspace.tsx');
  assert.match(pane, /inert=\{workspace\.preview \? true : undefined\}/);
  assert.match(pane, /<UnboxPreviewLock/);
});

test('preview opens through its own read path, never the writing ingest submit', () => {
  const open = read('src/components/sidebar/receiving/useUnboxPreviewOpen.ts');
  assert.match(open, /preview-scan/);
  assert.match(open, /receiving_id_in=/);
  assert.ok(!open.includes('submitTrackingScan'), 'lookup-po writes; preview must not reach it');
  assert.ok(!open.includes('lookup-po'));
  assert.match(open, /preview: true/);
});

test('the band never says PREVIEW — it shows the value like any scan would', () => {
  const bar = read('src/components/station/scan-bar/StationScanBar.tsx');
  // The stance is never CHROME on the bar — no status face, no 'Lookup failed'
  // row. A miss is a toast (transient), which is a different thing from a
  // permanent label the operator has to dismiss.
  assert.ok(!/data-station-scan-preview/.test(bar));
  assert.ok(!/Lookup failed|LOOKUP FAILED|No match/i.test(bar));
});

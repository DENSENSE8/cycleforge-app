/**
 * The counter face must offer all four CRUD verbs on a cart line, plus triage.
 *
 * The gap this pins: `kioskSessionStore.updateLine` shipped with ZERO callers,
 * so a mistyped serial could only be fixed by voiding the line and re-running
 * intake (which also threw away the signature). Read + create + delete are easy
 * to notice missing; update is the one that silently never gets built.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const LEDGER = read('src/app/kiosk/v2/KioskCartLedger.tsx');
const EDITOR = read('src/components/kiosk/KioskCartLineEditor.tsx');
const SHELL = read('src/app/kiosk/KioskShell.tsx');
const SPINE = read('src/app/kiosk/KioskUtilitySpine.tsx');

describe('kiosk cart line CRUD', () => {
  it('CREATE — the shell adds lines from scan and from the panes', () => {
    assert.match(SHELL, /actions\.addRetail/);
  });

  it('READ — the ledger renders every line', () => {
    assert.match(LEDGER, /session\.lines\.map/);
  });

  it('UPDATE — the row opens an editor that calls updateLine', () => {
    assert.match(LEDGER, /KioskCartLineEditor/);
    assert.match(LEDGER, /data-testid="kiosk-cart-line"/);
    assert.match(EDITOR, /actions\.updateLine/);
    // Every identification field an operator can get wrong is editable.
    for (const field of ['serialNumber', 'imei', 'quantity', 'unitAmountCents', 'title']) {
      assert.match(EDITOR, new RegExp(field), `line editor must expose ${field}`);
    }
  });

  it('UPDATE — a repair quote writes BOTH the total and the printed payload', () => {
    // They are two stores of the same fact; letting them drift means the
    // paperwork prints a different price than the customer is charged.
    assert.match(EDITOR, /patchPayload\(\{ price:/);
  });

  it('DELETE — per line and for the whole ticket', () => {
    assert.match(LEDGER, /data-testid="kiosk-cart-void-line"/);
    assert.match(LEDGER, /data-testid="kiosk-cart-void-all"/);
    assert.match(EDITOR, /actions\.removeLine/);
  });
});

describe('utility panels mount in the CENTER stage, never as a drawer', () => {
  const CHROME = read('src/app/kiosk/kiosk-chrome.ts');

  it('the panels share a full-width center face — no fixed rail width, no left seam', () => {
    assert.match(CHROME, /KIOSK_UTILITY_PANEL_FACE/);
    const face = CHROME.slice(CHROME.indexOf('KIOSK_UTILITY_PANEL_FACE'));
    const decl = face.slice(0, face.indexOf(');'));
    assert.match(decl, /w-full/);
    // A pinned column width or a left hairline is the drawer shape returning.
    assert.doesNotMatch(decl, /\bw-80\b/);
    assert.doesNotMatch(decl, /border-l\b/);
    for (const panel of [
      'src/app/kiosk/v2/KioskCartLedger.tsx',
      'src/app/kiosk/v2/KioskPaperworkPanel.tsx',
      'src/app/kiosk/v2/KioskTriagePanel.tsx',
    ]) {
      assert.match(read(panel), /KIOSK_UTILITY_PANEL_FACE/, `${panel} must use the center face`);
    }
  });

  it('they render INSIDE the center stage container, beside the work surface', () => {
    const center = SHELL.slice(
      SHELL.indexOf('data-testid="kiosk-work-surface"'),
      SHELL.indexOf('<KioskUtilitySpine'),
    );
    for (const panel of ['KioskCartLedger', 'KioskPaperworkPanel', 'KioskTriagePanel']) {
      assert.match(center, new RegExp(`<${panel}`), `${panel} must mount in the center stage`);
    }
  });

  it('never animates in over the work — no drawer/overlay chrome on the panels', () => {
    for (const panel of [
      'src/app/kiosk/v2/KioskCartLedger.tsx',
      'src/app/kiosk/v2/KioskPaperworkPanel.tsx',
      'src/app/kiosk/v2/KioskTriagePanel.tsx',
    ]) {
      // Only the panel's own chrome — the payment step-up IS a modal by design
      // (a PIN over the counter face), so name-matching "Sheet" would be wrong.
      const src = read(panel);
      const layoutClasses = [...src.matchAll(/className=\{?["'`]([^"'`]+)/g)]
        .map((m) => m[1])
        .join(' ');
      assert.doesNotMatch(
        layoutClasses,
        /\bfixed\b|\binset-0\b|\btranslate-x|\babsolute inset\b/,
        `${panel} must not paint drawer / overlay positioning`,
      );
    }
  });

  it('the work surface is hidden, not unmounted (catalog must not refetch)', () => {
    assert.match(SHELL, /utilitySlot !== null && 'hidden'/);
  });
});

describe('kiosk triage', () => {
  it('is a rail slot with a blocker badge', () => {
    assert.match(SPINE, /id: 'triage'/);
    assert.match(SPINE, /blockerCount/);
    assert.match(SHELL, /KioskTriagePanel/);
  });

  it('the submit gate and the panel read ONE model', () => {
    assert.match(LEDGER, /firstKioskBlocker/);
    assert.doesNotMatch(
      LEDGER,
      /Repair line needs a serial number/,
      'the ledger must not re-implement blocker strings',
    );
    assert.match(read('src/app/kiosk/v2/KioskTriagePanel.tsx'), /collectKioskTriage/);
  });

  it('a triage row routes to the failing field on the failing line', () => {
    assert.match(SHELL, /resolveTriageItem/);
    assert.match(SHELL, /setUtilitySlot\('cart'\)/);
    assert.match(LEDGER, /focus\?\.lineId/);
  });
});

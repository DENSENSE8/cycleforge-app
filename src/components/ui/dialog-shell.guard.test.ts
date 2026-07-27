import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the modal-shell SoT.
 *
 * Centered modal overlays compose `@/design-system/components/Dialog` /
 * `AlertDialog` (Radix under house tokens). Radix supplies the focus trap, focus
 * restore on close, Escape, scroll lock, `aria-modal`, and a body portal that
 * escapes transformed ancestors. A hand-rolled `fixed inset-0` scrim supplies
 * none of those — a 2026-07 audit found 34 hand-rolled shells and **not one**
 * trapped focus.
 *
 * Detection is the giveaway a shell was hand-rolled: writing `role="dialog"` or
 * `aria-modal` yourself. A component composing the DS Dialog never writes
 * either — Radix does. So the count naturally falls to zero as shells migrate.
 *
 * The guard RATCHETS: it may only shrink. Do NOT raise the baseline to land a
 * change (root `AGENTS.md`). To fix a finding, compose `Dialog` / `AlertDialog`
 * (a non-default scrim z-band or blur is what `overlayClassName` is for), or
 * `BottomSheet` / `ConfirmSheet` for floor sheets, or `Popover` / `AnchoredLayer`
 * for an anchored non-modal — a popover carrying `role="dialog"` actively
 * misleads screen readers by promising modal semantics it does not implement.
 *
 * A genuinely-bespoke overlay (a media lightbox running its own documented focus
 * trap) is exempt with a `ds-allow-dialog` comment on the same line or the line
 * above; that also drops the baseline, which is the point.
 *
 * Known categories inside the current baseline, none yet triaged:
 *   · sheets      — BottomSheet + the four Bin*Sheet consumers
 *   · slide-overs — SkuPairingModal / BinDetailFlyout (two shapes, one job;
 *                   the SoT is DocumentSlideOver / shells/detail-stack)
 *   · popovers    — ~13 anchored popovers mislabeled role="dialog"
 *   · viewers     — PhotoViewerModal (has its own trapRef), NasPhotoPicker (none)
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Shrink-only. LOWER as shells migrate onto the DS Dialog; never raise.
const HAND_ROLLED_DIALOG_BASELINE = 43;

const ESCAPE_MARKER = 'ds-allow-dialog';

/** JSX attribute form only — `role="dialog"` / `aria-modal={…}`. */
const DIALOG_ATTR_RE = /\brole=(["'])dialog\1|\baria-modal=/;
/** A DOM *query* for an existing dialog is a read, not a declaration. */
const QUERY_LINE_RE = /closest\(|querySelector/;
/** Prose in a JSDoc/line comment is not a shell. */
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/?\*)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.endsWith('.guard.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('hand-rolled modal shells do not grow (ratchet → DS Dialog)', () => {
  let count = 0;
  const offenders: string[] = [];

  for (const file of ALL_SOURCE_FILES) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!DIALOG_ATTR_RE.test(line)) return;
      if (QUERY_LINE_RE.test(line)) return;
      if (COMMENT_LINE_RE.test(line)) return;
      if (line.includes(ESCAPE_MARKER)) return;
      if (i > 0 && lines[i - 1]!.includes(ESCAPE_MARKER)) return;
      count += 1;
      offenders.push(`  ${file.slice(SRC_ROOT.length + 1).split(sep).join('/')}:${i + 1}`);
    });
  }

  assert.ok(
    count <= HAND_ROLLED_DIALOG_BASELINE,
    `Hand-rolled modal shells grew to ${count} (baseline ${HAND_ROLLED_DIALOG_BASELINE}).\n` +
      'Compose @/design-system/components/Dialog (or AlertDialog) — it brings the focus trap,\n' +
      'focus restore, Escape, scroll lock and body portal that a raw `fixed inset-0` scrim lacks.\n' +
      'Use `overlayClassName` for a non-default scrim z-band/blur, BottomSheet/ConfirmSheet for a\n' +
      'floor sheet, or Popover/AnchoredLayer for an anchored non-modal. A genuinely bespoke overlay\n' +
      `carries a same-line \`${ESCAPE_MARKER}\` comment.\nOffending sites:\n${offenders.join('\n')}`,
  );

  // Tighten the ratchet the moment the surface shrinks.
  assert.ok(
    count >= HAND_ROLLED_DIALOG_BASELINE - 4,
    `Hand-rolled modal shells dropped to ${count} — LOWER HAND_ROLLED_DIALOG_BASELINE to ${count}.`,
  );
});

test('keystone: the DS Dialog stays the modal shell SoT', () => {
  const dialogSrc = readFileSync(join(SRC_ROOT, 'design-system/components/Dialog.tsx'), 'utf8');

  assert.ok(
    dialogSrc.includes("from '@radix-ui/react-dialog'"),
    'Dialog must stay on Radix — the focus trap / restore / scroll lock come from it.',
  );
  for (const symbol of ['DialogContent', 'DialogTitle', 'DialogOverlay']) {
    assert.ok(dialogSrc.includes(symbol), `Dialog.tsx must define ${symbol}.`);
  }
  assert.ok(
    dialogSrc.includes('overlayClassName'),
    'DialogContent must keep `overlayClassName` — without a stylable scrim, any modal needing a ' +
      'different z band or blur forks its own shell, which is how this drifted in the first place.',
  );
  assert.ok(
    dialogSrc.includes("elevationClass('overlay')"),
    'Dialog must take its lift from the elevation SoT, not a hand-rolled shadow.',
  );
});

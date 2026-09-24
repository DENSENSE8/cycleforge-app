/**
 * The phone's ONE ground, and the machine that keeps it one.
 *
 * ## The rule
 *
 * A `/m` screen is a single white sheet. The ground is
 * `appMobilePageGroundClass` (`bg-surface-card`), re-exported as
 * `TOKENS.colors.background` so the shell and every screen name the same
 * string. Grey belongs to the DESK, where a card floats on a canvas plane a
 * real ~6% below card white so its shadow has something to cast onto
 * (`themes/light.ts`, the GROUND-PLANE RULE in `styles/globals.css`). A phone
 * has no rail, no floating card and no shadow to read — there, the same grey is
 * just a gap behind white rows.
 *
 * ## Why this is a ratchet and not an assertion
 *
 * The rule was stated in `DesignSystem.tsx` long before the tree obeyed it:
 * every screen that paints `bg-surface-canvas` on its own root OVERRIDES the
 * shell's white, which is exactly how `/m/pair` came to be grey inside a white
 * shell (operator 2026-09-15). {@link MOBILE_GRAY_GROUND_BASELINE} is the count
 * that existed when the guard landed. The test asserts the count never RISES,
 * and that the ported surfaces hold at zero.
 *
 * So the honest answer to *"can I be sure I never see that grey again?"*:
 *
 * - On a ported surface — YES, by this module: {@link MOBILE_GRAY_GROUND_ZERO}
 *   files fail the gate on the first grey class anyone adds back.
 * - Anywhere else on `/m` — NOT YET, and the remaining count is published
 *   rather than implied. It can only shrink; when it reaches 0, drop the
 *   baseline to 0 and the phone is white by machine, everywhere.
 *
 * A text scan cannot see grey that arrives as an inline style or a flipped
 * theme var. That is the runtime sweep's job, not this module's.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Repo root, from this file's location (`src/lib/mobile`). */
const ROOT = path.resolve(__dirname, '..', '..', '..');

/** The phone tree. Nothing outside it is this rule's business. */
export const MOBILE_GROUND_ROOTS = ['src/app/m', 'src/components/mobile'] as const;

/**
 * The GROUND half of the law, as pins that must all still be true.
 *
 * Banning grey only says what a ground is NOT. These say what it IS, at each
 * altitude the chain passes through, so a ground cannot be undone quietly from
 * underneath a screen that never changed:
 *
 *   class  →  house token  →  CSS var  →  light-theme hex
 *
 * BOTH light-mode planes are pinned, because they are one decision taken twice
 * and drifting either breaks the other's rationale:
 *
 *   - `background-surface` `#ffffff` — the sheet. Phone pages, kiosk product
 *     stage, every card.
 *   - `background-canvas` `#fafafa` — the desk page plane (operator 2026-09-15:
 *     *"pin the FAFAFA token for a standard background in light mode"*). It was
 *     `#eef2f7`; the retune, and the hairline-not-elevation consequence, are
 *     documented at the value itself in `packages/design-tokens/src/light.ts`.
 *
 * They are read as TEXT rather than imported. `DesignSystem.tsx` is a
 * `'use client'` module that pulls in motion + Button, `kiosk-pos-surface.ts`
 * lives under `src/app` (the Boundary gate's business, not this module's), and
 * a guard that drags half the UI into a CLI to read one string is a guard
 * nobody runs.
 */
export const GROUND_TOKEN_PINS = [
  {
    what: 'the house phone ground is the card-white token',
    file: 'src/design-system/tokens/app-surface.ts',
    expect: /appMobilePageGroundClass\s*=\s*'bg-surface-card'/,
  },
  {
    what: 'the phone shell re-exports that token instead of restating a white',
    file: 'src/components/mobile/redesign/DesignSystem.tsx',
    expect: /background:\s*appMobilePageGroundClass/,
  },
  {
    what: 'the kiosk product stage is the SAME token, not a page-local hex',
    file: 'src/app/kiosk/kiosk-pos-surface.ts',
    expect: /KIOSK_POS_CANVAS\s*=\s*'bg-surface-card'/,
  },
  {
    what: 'light mode resolves that token to white',
    file: 'packages/design-tokens/src/light.ts',
    expect: /'background-surface':\s*'#ffffff'/,
  },
  {
    what: 'light mode pins the standard page plane at FAFAFA',
    file: 'packages/design-tokens/src/light.ts',
    expect: /'background-canvas':\s*'#fafafa'/,
  },
  {
    what: 'the light-theme preview swatch shows the plane it actually paints',
    file: 'src/design-system/themes/light.ts',
    expect: /preview:\s*\{\s*canvas:\s*'#fafafa'/,
  },
  {
    what: 'the wash presets author against that plane, not the retired hex',
    file: 'src/design-system/tokens/app-surface.ts',
    expect: /previewTo:\s*'#fafafa'/,
  },
] as const;

export interface GroundPinResult {
  what: string;
  file: string;
  ok: boolean;
}

/** Check every pin. A `false` is the white having been undone at that altitude. */
export function auditGroundTokens(): GroundPinResult[] {
  return GROUND_TOKEN_PINS.map((pin) => {
    let source = '';
    try {
      source = readFileSync(path.join(ROOT, pin.file), 'utf8');
    } catch {
      return { what: pin.what, file: pin.file, ok: false };
    }
    return { what: pin.what, file: pin.file, ok: pin.expect.test(source) };
  });
}

/**
 * Ground fills that are NOT the phone's white sheet.
 *
 * `bg-surface-canvas` is the desk's plane; the raw grey families are a second
 * language on top of that (raw grey utilities predate the token). Wells and
 * washes (`bg-surface-sunken`, `bg-surface-hover`) are deliberately absent —
 * a sunken input slot and a row hover are not page grounds.
 */
const GRAY_GROUND_RE =
  /\bbg-surface-canvas\b|\bbg-(?:gray|slate|zinc|neutral|stone)-\d{2,3}\b|\bappCanvasClass\b/g;

/**
 * Surfaces already ported to the white sheet. These hold at ZERO — the pair /
 * on-hold flow the operator ported on 2026-09-15, plus the shell and token
 * modules that define the ground in the first place.
 */
export const MOBILE_GRAY_GROUND_ZERO = [
  'src/components/mobile/triage/MobileTriagePage.tsx',
  'src/components/mobile/triage/TriageRow.tsx',
  'src/components/mobile/pair/MobilePairLocation.tsx',
  'src/components/mobile/pair/MobilePairQty.tsx',
  'src/components/mobile/pair/PairDetailSheet.tsx',
  'src/components/mobile/onhold/MobileOnHoldList.tsx',
  'src/components/mobile/onhold/MobileOnHoldMerge.tsx',
  'src/components/mobile/onhold/MobileSkuExceptionDetail.tsx',
  'src/components/mobile/onhold/SkuExceptionPhotos.tsx',
  'src/components/mobile/onhold/SkuExceptionLocations.tsx',
  'src/components/mobile/scan/ProvisionalCreateSheet.tsx',
  'src/components/mobile/redesign/MobileShell.tsx',
  'src/app/m/(shell)/rs/[id]/page.tsx',
  'src/app/m/(shell)/rs/[id]/work/page.tsx',
  'src/app/m/(shell)/rs/[id]/record/page.tsx',
  // NOT DesignSystem.tsx: it declares the ground, but its `Card variant="flat"`
  // still fills with canvas. That is a card face, not a page ground — port it
  // with the rest of the count, not by exempting the file that owns the token.
] as const;

export interface MobileGrayGround {
  /** Repo-relative, POSIX separators. */
  file: string;
  line: number;
  /** The offending class, verbatim. */
  match: string;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Every grey ground still painted inside the phone tree, in file order. */
export function findMobileGrayGrounds(): MobileGrayGround[] {
  const found: MobileGrayGround[] = [];
  for (const root of MOBILE_GROUND_ROOTS) {
    for (const abs of walk(path.join(ROOT, root)).sort()) {
      const file = path.relative(ROOT, abs).split(path.sep).join('/');
      const lines = readFileSync(abs, 'utf8').split('\n');
      lines.forEach((text, index) => {
        // PROSE is not paint. A docblock explaining why the desk keeps canvas,
        // or a comment naming the class it just retired, is not a grey ground —
        // counting it would make the guard fire on its own explanation.
        const code = text.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (/^\s*\*/.test(text) || /^\s*\/\//.test(text)) return;
        for (const m of code.matchAll(GRAY_GROUND_RE)) {
          found.push({ file, line: index + 1, match: m[0] });
        }
      });
    }
  }
  return found;
}

/**
 * Grey grounds present when the guard landed (2026-09-15), across 32 files.
 *
 * SHRINK-ONLY. Port a screen onto `TOKENS.colors.background`, drop this number
 * by what you removed, and add the file to {@link MOBILE_GRAY_GROUND_ZERO} so
 * it can never regress. Raising it is the one edit this module exists to stop.
 */
export const MOBILE_GRAY_GROUND_BASELINE = 40;

export function formatMobileGrayGround(hit: MobileGrayGround): string {
  return `${hit.file}:${hit.line} — ${hit.match}`;
}

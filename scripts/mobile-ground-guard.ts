/**
 * CLI face of the PHONE GROUND law: **a `/m` screen is one white sheet**
 * (operator 2026-09-15 — the pair screens were grey inside a white shell, and
 * *"the white color will always remain there"*).
 *
 * Two verdicts in one run, because "never grey again" needs both halves:
 *
 *   1. WHITE IS PINNED — the four altitudes of the chain
 *      (`class → house token → phone shell → light-theme hex`) all still say
 *      card white. A pin that fails means the white was undone from underneath
 *      a screen nobody edited.
 *   2. GREY IS RATCHETED — the ported surfaces hold at ZERO, and the rest of
 *      the phone tree may only shrink from `MOBILE_GRAY_GROUND_BASELINE`.
 *
 * Same rule module as `src/lib/mobile/mobile-ground.test.ts` (verify's Unit
 * tests) and as the `ds_mobile_ground` MCP tool, which spawns this script
 * exactly as `ds_mobile_first` spawns `mobile-first-guard.ts`.
 *
 * Exit 0 = the law holds. Exit 1 = a verdict failed. Exit 2 = the guard itself
 * broke, which is never a verdict.
 */

import {
  auditGroundTokens,
  findMobileGrayGrounds,
  formatMobileGrayGround,
  MOBILE_GRAY_GROUND_BASELINE,
  MOBILE_GRAY_GROUND_ZERO,
} from '../src/lib/mobile/mobile-ground';

const asJson = process.argv.includes('--json');

try {
  const pins = auditGroundTokens();
  const unpinned = pins.filter((pin) => !pin.ok);

  const hits = findMobileGrayGrounds();
  const zero = new Set<string>(MOBILE_GRAY_GROUND_ZERO);
  const regressions = hits.filter((hit) => zero.has(hit.file)).map(formatMobileGrayGround);
  const remaining = hits.length;

  const violations = [
    ...unpinned.map((pin) => `white is no longer pinned: ${pin.what} (${pin.file})`),
    ...regressions.map((r) => `grey is back on a ported surface: ${r}`),
    ...(remaining > MOBILE_GRAY_GROUND_BASELINE
      ? [`grey grounds on /m rose to ${remaining} (baseline ${MOBILE_GRAY_GROUND_BASELINE})`]
      : []),
    ...(remaining < MOBILE_GRAY_GROUND_BASELINE
      ? [
          `port complete — drop MOBILE_GRAY_GROUND_BASELINE to ${remaining} in the same commit, ` +
            'or the slack becomes room for the next regression',
        ]
      : []),
  ];

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: violations.length === 0,
          ground: {
            sheet: {
              class: 'bg-surface-card',
              token: 'appMobilePageGroundClass (src/design-system/tokens/app-surface.ts)',
              cssVar: '--ds-color-background-surface',
              light: '#ffffff',
              usedBy: 'phone pages (TOKENS.colors.background) · kiosk product stage (KIOSK_POS_CANVAS) · every card',
            },
            plane: {
              class: 'bg-surface-canvas',
              cssVar: '--ds-color-background-canvas',
              light: '#fafafa',
              usedBy: 'desk page planes · FIND stage ground · wash hosts',
              note: 'FAFAFA pinned 2026-09-15 (was #eef2f7). A 2% step under the sheet: separation on light is HAIRLINES, not elevation — a shadow cast onto this plane will not read. Do not darken it back to make a card look raised.',
            },
          },
          whitePins: pins,
          grayGrounds: { remaining, baseline: MOBILE_GRAY_GROUND_BASELINE, portedToZero: MOBILE_GRAY_GROUND_ZERO.length },
          violations,
          law:
            'A phone screen is ONE white sheet: bg-surface-card, via TOKENS.colors.background. ' +
            'bg-surface-canvas is the DESK plane — it exists so a raised card has a ground to cast ' +
            'onto (GROUND-PLANE RULE, styles/globals.css). A phone has no floating card, so the ' +
            'same grey is just a gap behind white rows. Never flip background-canvas to white to ' +
            'get this: that flattens every desk card and does not touch the other seven themes.',
          burndown:
            'Grey remaining is published, not implied. Port a screen onto TOKENS.colors.background, ' +
            'lower the baseline, add the file to MOBILE_GRAY_GROUND_ZERO. At 0 the phone is white by machine.',
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(
      `mobile-ground-guard: sheet → bg-surface-card (#ffffff) · plane → bg-surface-canvas (#fafafa) in light\n` +
        `${pins.map((p) => `  ${p.ok ? 'pinned  ' : 'UNPINNED'} ${p.what}`).join('\n')}\n` +
        `  grey on /m → ${remaining} (baseline ${MOBILE_GRAY_GROUND_BASELINE}), ` +
        `${MOBILE_GRAY_GROUND_ZERO.length} ported surfaces at zero\n` +
        (violations.length === 0
          ? 'white is pinned at every altitude; no ported surface has grey.\n'
          : `${violations.length} violation(s):\n${violations.map((v) => `  ${v}`).join('\n')}\n`),
    );
  }

  process.exit(violations.length === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`mobile-ground-guard failed: ${String(error)}\n`);
  process.exit(2);
}

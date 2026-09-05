import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOBILE_BANNED_CONTROL_CLASSES,
  MOBILE_BANNED_TEXT_ROLES,
  MOBILE_CONTROL_LADDER,
  MOBILE_DISPLAY_COHORT,
  MOBILE_MAX_CTA_PER_SURFACE,
  MOBILE_MAX_TYPE_ROLES_PER_FILE,
  MOBILE_MIN_TEXT_PX,
  mobileDisplayLawFiles,
} from '@/lib/mobile/mobile-display-cohort';

/**
 * The cohort tripwire.
 *
 * Asserted on EVERY member, not on a golden screen. A new `/m` surface joins
 * `MOBILE_DISPLAY_COHORT` and is bound by the same law from its first commit —
 * which is the whole reason the cohort is a list rather than a lint rule
 * pointed at one directory.
 */

const read = (file: string) => readFileSync(file, 'utf8');

/** Strip comments so PROSE about a banned class is not a violation. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('mobile display cohort — law', () => {
  it('has a ladder whose paint never exceeds its hit area', () => {
    for (const [name, size] of Object.entries(MOBILE_CONTROL_LADDER)) {
      assert.ok(size.paint <= size.hit, `${name}: paint ${size.paint} > hit ${size.hit}`);
      assert.ok(size.hit >= 44, `${name}: hit ${size.hit} is under Apple's 44pt floor`);
      // WCAG 2.2 SC 2.5.8 Level AA — 24x24 CSS px is the absolute paint floor.
      assert.ok(size.paint >= 24, `${name}: paint ${size.paint} is under WCAG's 24px floor`);
    }
  });

  it('sets the text floor at Apple’s 11pt', () => {
    assert.equal(MOBILE_MIN_TEXT_PX, 11);
  });

  it('lists at least one member — an empty cohort enforces nothing', () => {
    assert.ok(MOBILE_DISPLAY_COHORT.length > 0);
    assert.ok(mobileDisplayLawFiles().length > 0);
  });
});

describe('mobile display cohort — every member obeys it', () => {
  for (const member of MOBILE_DISPLAY_COHORT) {
    describe(`${member.id} (${member.route})`, () => {
      it('renders no text below the legibility floor', () => {
        for (const file of member.files) {
          for (const banned of MOBILE_BANNED_TEXT_ROLES) {
            assert.ok(
              !code(read(file)).includes(banned),
              `${file} uses ${banned}, which is 10px — under Apple's ${MOBILE_MIN_TEXT_PX}pt floor`,
            );
          }
        }
      });

      it('paints no desk-sized controls', () => {
        for (const file of member.files) {
          const source = code(read(file));
          for (const banned of MOBILE_BANNED_CONTROL_CLASSES) {
            assert.ok(
              !new RegExp(`["'\\s]${banned}[\\s"']`).test(source),
              `${file} paints ${banned} (56px) — the phone ladder tops out at ${MOBILE_CONTROL_LADDER.cta.paint}px`,
            );
          }
          assert.ok(
            !/size=["']lg["']/.test(source),
            `${file} uses size="lg", which resolves to h-14 (56px) in mobile mode`,
          );
        }
      });

      it('keeps at most two type roles per file', () => {
        for (const file of member.files) {
          const roles = new Set(code(read(file)).match(/text-role-[a-z]+/g) ?? []);
          assert.ok(
            roles.size <= MOBILE_MAX_TYPE_ROLES_PER_FILE,
            `${file} renders ${roles.size} type roles (${[...roles].join(', ')}); the cap is ${MOBILE_MAX_TYPE_ROLES_PER_FILE} — hierarchy on a phone comes from weight and ground, not a third size`,
          );
        }
      });

      it('has at most one screen-primary control', () => {
        const ctas = member.files.reduce(
          (n, file) => n + (code(read(file)).match(/variant=["']primary["']/g) ?? []).length,
          0,
        );
        assert.ok(
          ctas <= MOBILE_MAX_CTA_PER_SURFACE,
          `${member.id} paints ${ctas} primary controls; a phone surface gets ${MOBILE_MAX_CTA_PER_SURFACE}`,
        );
      });

      it('lists files that actually exist', () => {
        for (const file of member.files) {
          assert.doesNotThrow(() => read(file), `${file} is listed in the cohort but missing`);
        }
      });
    });
  }
});

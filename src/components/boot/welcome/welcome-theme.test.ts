/** The welcome's holiday calendar: Pacific-date windows and the Thanksgiving week. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WELCOME_PARTICLE_CAP,
  WELCOME_THEMES,
  fourthThursdayOfNovember,
  resolveWelcomeTheme,
  serializeWelcomeTheme,
  welcomePaletteStyle,
  welcomeParticleLayout,
  type WelcomeTheme,
} from './welcome-theme';

/** Noon Pacific on a calendar day (PDT/PST both land on the same date). */
const pacificNoon = (iso: string) => new Date(`${iso}T20:00:00Z`);
const themeOn = (iso: string) => resolveWelcomeTheme(pacificNoon(iso)).id;

describe('fourthThursdayOfNovember', () => {
  it('matches the US Thanksgiving dates for 2026–2028', () => {
    assert.equal(fourthThursdayOfNovember(2026), 26);
    assert.equal(fourthThursdayOfNovember(2027), 25);
    assert.equal(fourthThursdayOfNovember(2028), 23);
  });
});

describe('resolveWelcomeTheme', () => {
  it('Halloween covers Oct 24–31 only', () => {
    assert.equal(themeOn('2026-10-23'), 'default');
    assert.equal(themeOn('2026-10-24'), 'halloween');
    assert.equal(themeOn('2026-10-31'), 'halloween');
    assert.equal(themeOn('2026-11-01'), 'default');
  });

  it('Thanksgiving is Mon–Fri of the 4th-Thursday week', () => {
    for (const [monday, friday, sunday, saturday] of [
      ['2026-11-23', '2026-11-27', '2026-11-22', '2026-11-28'],
      ['2027-11-22', '2027-11-26', '2027-11-21', '2027-11-27'],
      ['2028-11-20', '2028-11-24', '2028-11-19', '2028-11-25'],
    ]) {
      assert.equal(themeOn(monday), 'thanksgiving', monday);
      assert.equal(themeOn(friday), 'thanksgiving', friday);
      assert.equal(themeOn(sunday), 'default', sunday);
      assert.equal(themeOn(saturday), 'default', saturday);
    }
  });

  it('Christmas covers Dec 1–26, New Year Dec 30–Jan 2, default between', () => {
    assert.equal(themeOn('2026-11-30'), 'default');
    assert.equal(themeOn('2026-12-01'), 'christmas');
    assert.equal(themeOn('2026-12-26'), 'christmas');
    assert.equal(themeOn('2026-12-27'), 'default');
    assert.equal(themeOn('2026-12-29'), 'default');
    assert.equal(themeOn('2026-12-30'), 'new-year');
    assert.equal(themeOn('2027-01-02'), 'new-year');
    assert.equal(themeOn('2027-01-03'), 'default');
  });

  it('uses the Pacific calendar, not UTC', () => {
    // 2026-10-24 03:00 UTC is still Oct 23 in Los Angeles.
    assert.equal(resolveWelcomeTheme(new Date('2026-10-24T03:00:00Z')).id, 'default');
    // 2027-01-03 07:30 UTC is still Jan 2 in Los Angeles.
    assert.equal(resolveWelcomeTheme(new Date('2027-01-03T07:30:00Z')).id, 'new-year');
  });

  it('honours a valid override outside production, ignores unknown ids', () => {
    assert.equal(resolveWelcomeTheme(pacificNoon('2026-06-01'), 'christmas').id, 'christmas');
    assert.equal(resolveWelcomeTheme(pacificNoon('2026-06-01'), 'easter').id, 'default');
    assert.equal(resolveWelcomeTheme(pacificNoon('2026-06-01'), 'toString').id, 'default');
  });

  it('ignores the override in production', () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      assert.equal(resolveWelcomeTheme(pacificNoon('2026-06-01'), 'christmas').id, 'default');
    } finally {
      env.NODE_ENV = previous;
    }
  });
});

describe('welcomeParticleLayout', () => {
  it('is deterministic and capped', () => {
    const spec = { ...WELCOME_THEMES.christmas.particles!, count: 100 };
    const first = welcomeParticleLayout(spec);
    assert.equal(first.length, WELCOME_PARTICLE_CAP);
    assert.deepEqual(welcomeParticleLayout(spec), first);
  });
});

describe('welcomePaletteStyle', () => {
  const withPalette = (palette: WelcomeTheme['palette']): WelcomeTheme => ({ ...WELCOME_THEMES.default, palette });

  it('leaves the everyday palette entirely staff-derived', () => {
    assert.deepEqual(welcomePaletteStyle(WELCOME_THEMES.default), {});
  });

  it('nearHue centres the near shades on an absolute hue, spread still applied', () => {
    const vars = welcomePaletteStyle(withPalette({ nearHue: 150, nearHueSpread: 14 }));
    assert.equal(vars['--welcome-near-hue'], '150');
    assert.equal(vars['--welcome-near-follow'], '0');
    assert.equal(vars['--welcome-near-spread'], '14');
    assert.match(vars['--welcome-near-seed'] ?? '', /^oklch\([\d.]+ [\d.]+ 150\)$/);
  });

  it('without nearHue the near shades keep following the staff hue', () => {
    const vars = welcomePaletteStyle(withPalette({ nearHueSpread: 40 }));
    assert.equal(vars['--welcome-near-follow'], undefined);
    assert.equal(vars['--welcome-near-hue'], undefined);
    assert.equal(vars['--welcome-near-spread'], '40');
  });

  it('Christmas forces green near shades and a red accent; the boot payload carries them', () => {
    const vars = welcomePaletteStyle(WELCOME_THEMES.christmas);
    const nearHue = Number(vars['--welcome-near-hue']);
    assert.ok(nearHue >= 130 && nearHue <= 165, `near hue ${nearHue} is green`);
    assert.match(vars['--welcome-accent-seed'] ?? '', / (1\d|2\d|3\d)\)$/);
    assert.deepEqual(JSON.parse(serializeWelcomeTheme(WELCOME_THEMES.christmas)).vars, vars);
  });
});

describe('holiday themes', () => {
  it('stay within the ambient budget: shapes ≤ 0.35 opacity, particles ≤ cap', () => {
    for (const theme of Object.values(WELCOME_THEMES)) {
      if (theme.id === 'default') continue;
      for (const shape of theme.shapes) assert.ok(shape.opacity <= 0.35, `${theme.id} shape opacity ${shape.opacity}`);
      assert.ok((theme.particles?.count ?? 0) <= WELCOME_PARTICLE_CAP, theme.id);
    }
  });
});

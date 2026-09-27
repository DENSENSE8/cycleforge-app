// No motion import: this renders on /signin, the public critical route.
// Static twin of WelcomeAssembly's greeting at rest, shown between sign-in and
// the Daily page's welcome so the hand-off reads as one screen. Every class
// comes from the shared resting frame in src/lib/boot-splash-script.ts, which
// BOOT_SPLASH_SCRIPT paints pre-hydration with the same markup; the theme's
// shapes come from AmbientLayerStatic (the script bakes the same spec).
import type { CSSProperties } from 'react';
import { IdentityMark } from '@/components/identity/IdentityMark';
import { AmbientLayerStatic } from '@/components/boot/welcome/AmbientLayerStatic';
import { WELCOME_THEMES, welcomePaletteStyle, type WelcomeTheme } from '@/components/boot/welcome/welcome-theme';
import {
  WELCOME_AVATAR_RING_CLASS,
  WELCOME_AVATAR_SLOT_CLASS,
  WELCOME_CARD_CLASS,
  WELCOME_CARD_GRAIN_CLASS,
  WELCOME_COLUMN_CLASS,
  WELCOME_FROST_CLASS,
  WELCOME_GROUND_CLASS,
  WELCOME_GROUND_GRAIN_CLASS,
  WELCOME_HEADLINE_CLASS,
  WELCOME_NAME_GLOW_CLASS,
  WELCOME_NAME_INK_CLASS,
  WELCOME_ROOT_CLASS,
  WELCOME_SOFT_LINE_CLASS,
  WELCOME_STAGE_CLASS,
  WELCOME_TAIL_SEPARATOR,
  welcomeStatusText,
  welcomeWeekday,
} from '@/lib/boot-splash-script';

interface WelcomeBridgeProps {
  name: string | null | undefined;
  colorHex: string;
  /** Same-origin photo URL; absent ⇒ initials on the staff colour. */
  avatarUrl?: string | null;
  initials: string;
  /** Theme resolved at sign-in (the one stashed for the Daily welcome). */
  themeId: WelcomeTheme['id'];
}

export function WelcomeBridge({ name, colorHex, avatarUrl, initials, themeId }: WelcomeBridgeProps) {
  const theme = WELCOME_THEMES[themeId];
  const style = { ...welcomePaletteStyle(theme), '--cf-welcome-name': colorHex } as CSSProperties;
  return (
    <div role="status" aria-live="polite" className={WELCOME_ROOT_CLASS} style={style}>
      <span className="sr-only">{welcomeStatusText(theme.greeting, name)}</span>

      <div aria-hidden className={WELCOME_GROUND_CLASS}>
        <div className={WELCOME_GROUND_GRAIN_CLASS} />
      </div>

      <AmbientLayerStatic theme={theme} />

      <div aria-hidden className={WELCOME_STAGE_CLASS}>
        <div className={`${WELCOME_CARD_CLASS} ${WELCOME_FROST_CLASS}`}>
          <div className={WELCOME_CARD_GRAIN_CLASS} />
          <div className={WELCOME_COLUMN_CLASS}>
            <span className={`${WELCOME_AVATAR_SLOT_CLASS} ${WELCOME_AVATAR_RING_CLASS}`}>
              <IdentityMark initials={initials} src={avatarUrl} colorHex={colorHex} size="2xl" ring={false} />
            </span>

            <p className={WELCOME_HEADLINE_CLASS}>
              <span>{theme.greeting}</span>
              {name && (
                <span>
                  {WELCOME_TAIL_SEPARATOR}
                  <span className={WELCOME_NAME_GLOW_CLASS}>
                    <span className={WELCOME_NAME_INK_CLASS}>{name}</span>
                  </span>
                </span>
              )}
            </p>

            <p className={WELCOME_SOFT_LINE_CLASS}>{welcomeWeekday()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

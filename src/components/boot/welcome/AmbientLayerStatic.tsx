/**
 * The ambient layer at rest — plain DOM + CSS, no motion import — for
 * WelcomeBridge on /signin's critical path. Same classes and inline custom
 * properties as AmbientLayer and serializeWelcomeTheme (BOOT_SPLASH_SCRIPT),
 * so all three renderers land the shapes identically. Particles are motion
 * only; at rest there are none.
 */
import type { CSSProperties } from 'react';
import {
  WELCOME_AMBIENT_LAYER_CLASS,
  welcomeShapeClass,
  welcomeShapeStyle,
  type WelcomeTheme,
} from './welcome-theme';

export function AmbientLayerStatic({ theme }: { theme: WelcomeTheme }) {
  return (
    <div aria-hidden className={WELCOME_AMBIENT_LAYER_CLASS}>
      {theme.shapes.map((spec, index) => (
        <div key={index} className={welcomeShapeClass(spec)} style={welcomeShapeStyle(spec) as CSSProperties}>
          {spec.kind === 'path' && spec.d ? (
            <svg viewBox="0 0 100 100" aria-hidden>
              <path d={spec.d} fill="currentColor" />
            </svg>
          ) : null}
        </div>
      ))}
    </div>
  );
}

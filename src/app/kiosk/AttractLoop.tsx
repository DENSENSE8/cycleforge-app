'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from '@/design-system/motion';
import { MODE_REGISTRY } from '@/design-system/modes/registry';

/**
 * The wordmark field for the `plain` screensaver. The tenant's brand ground is
 * literally white in every theme, so a themed surface token would repaint a
 * logotype's ground when the app theme flips — a brand defect, not theming.
 */
// ds-allow-raw-neutral: brand ground, deliberately scheme-independent
// The attract field is a fixed white stage on a mounted customer tablet — it is
// deliberately theme-independent, like the loader plane.
// ds-allow-raw-neutral: fixed kiosk attract stage, theme-independent.
const PLAIN_ATTRACT_FIELD = 'fixed inset-0 z-panel flex cursor-pointer items-center justify-center bg-white px-8';

/**
 * Default wordmark ink = the counter mode's `brand` (USAV navy, sampled from
 * `public/images/usav-logo.png`). It is tenant brand DATA, not a theme token —
 * it never shifts with `data-theme`; the org's `brand.primaryColor` replaces
 * it (passed as `inkColor` here, and as `--mode-brand` on the counter region).
 * Read as a literal rather than `var(--mode-brand)` because the Settings
 * preview mounts this outside any counter region.
 */
const DEFAULT_BRAND_INK = MODE_REGISTRY.counter.brand;

/** Dogfood defaults — overridden by `brand.attractHeadline` / `attractSubline`. */
const DEFAULT_HEADLINE = 'USAV';
const DEFAULT_SUBLINE = 'Solutions';

/** Share of viewport width the lockup may occupy before it is scaled to fit. */
const LOCKUP_SAFE_WIDTH = 0.86;

export function AttractLoop({
  mediaUrl,
  brandName,
  logoUrl,
  onWake,
  active = true,
  plain = false,
  headline,
  subline,
  inkColor,
}: {
  mediaUrl: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
  onWake: () => void;
  /** Media mounts only while attract is the visible mode. */
  active?: boolean;
  /**
   * Wordmark screensaver: white field, no tap prompt. Attract media still wins
   * when it is set — an uploaded image is full-bleed and the wordmark is what
   * shows in its absence. Resolved per-tenant by the runtime.
   */
  plain?: boolean;
  /** Wordmark line 1 — `brand.attractHeadline`. */
  headline?: string | null;
  /** Wordmark line 2 — `brand.attractSubline`, letterspaced to line 1's width. */
  subline?: string | null;
  /** Wordmark ink — `brand.primaryColor`. */
  inkColor?: string | null;
}) {
  // Extension test tolerates a query string: a CDN or signed URL ends in
  // `?v=2`, not in `.mp4`, and anchoring at `$` sent those down the <img> path
  // — which renders a video file as a broken image.
  const isVideo = Boolean(active && mediaUrl?.match(/\.(mp4|webm|ogg)(\?|#|$)/i));
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showVideo = isVideo && mediaUrl && !reducedMotion;

  if (plain) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={PLAIN_ATTRACT_FIELD}
        onClick={onWake}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onWake();
          }
        }}
      >
        {/*
          Attract media OUTRANKS the wordmark: an uploaded image is the whole
          screensaver and nothing composites over it. `object-contain` (not
          `-cover`) keeps the operator's framing intact on a screen whose aspect
          ratio is not theirs, and the white field above shows through the
          letterbox and through any transparency in the file — so the ground
          behind an uploaded image is white, same as behind the wordmark.
        */}
        {active && mediaUrl ? (
          showVideo ? (
            <video
              src={mediaUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
          )
        ) : (
          <PlainWordmark
            headline={headline?.trim() || DEFAULT_HEADLINE}
            subline={subline?.trim() || DEFAULT_SUBLINE}
            ink={inkColor?.trim() || DEFAULT_BRAND_INK}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-panel flex cursor-pointer flex-col items-center justify-center bg-surface-inverse"
      onClick={onWake}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onWake();
        }
      }}
    >
      {showVideo ? (
        <video
          src={mediaUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      ) : active && mediaUrl && !isVideo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-surface-inverse px-8">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="max-h-24 max-w-xs object-contain" />
          ) : null}
          <p className="text-center text-3xl font-semibold tracking-tight text-white">
            {brandName?.trim() || 'Welcome'}
          </p>
        </div>
      )}

      <div
        className={cnTapOverlay(reducedMotion)}
      >
        <p className="text-2xl font-medium tracking-wide text-white">Tap anywhere to start</p>
      </div>
    </div>
  );
}

function cnTapOverlay(reducedMotion: boolean): string {
  return [
    'z-10 mb-24 mt-auto rounded-full bg-scrim/40 px-8 py-4 backdrop-blur-md',
    reducedMotion ? '' : 'animate-pulse',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Letterspaces the subline until its visual width matches the headline's — the
 * logotype lockup shape, where the small word spans the big one.
 *
 * MEASURED, not a constant: the tracking that squares "Solutions" under "USAV"
 * is wrong for any other pair of strings, and both are tenant-editable
 * (`brand.attractHeadline` / `attractSubline`). A hardcoded em value would
 * silently mis-set every tenant except the one it was tuned for.
 *
 * Both lines size in `em` off one clamped root, so the ratio is viewport-stable
 * — but the absolute px tracking is not, hence the resize pass. Widths are read
 * after `document.fonts.ready`: measuring the fallback face yields tracking for
 * a font that is about to be replaced.
 */
function useLockupTracking(headline: string, subline: string) {
  const headRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const head = headRef.current;
    const sub = subRef.current;
    const fit = fitRef.current;
    if (!head || !sub || !fit) return;

    let live = true;
    const measure = () => {
      if (!live) return;
      // Each line's own trailing letter-space is not ink — drop it from both the
      // target width and the measurement, or the lines square on their boxes
      // rather than on their glyphs.
      // Measure unscaled — the fit factor below is derived from these widths, so
      // reading them through a previous frame's scale compounds it.
      fit.style.transform = 'scale(1)';
      const headTrack = parseFloat(getComputedStyle(head).letterSpacing) || 0;
      const headWidth = head.getBoundingClientRect().width - headTrack;
      sub.style.letterSpacing = '0px';
      sub.style.marginRight = '0px';
      const subWidth = sub.getBoundingClientRect().width;
      const gaps = Math.max(1, subline.length - 1);
      // Never negative: a subline naturally wider than the headline gets normal
      // spacing rather than crushed glyphs.
      const track = Math.max(0, (headWidth - subWidth) / gaps);
      sub.style.letterSpacing = `${track}px`;
      sub.style.marginRight = `${-track}px`;

      // Font size clamps on VIEWPORT width, which knows nothing about how long
      // the tenant's word is: `NORTHGATE` at 15vw measures wider than the screen
      // it is painted on. Scale the whole lockup down to fit, never up — a short
      // word stays at its designed size rather than ballooning.
      const room = window.innerWidth * LOCKUP_SAFE_WIDTH;
      const widest = Math.max(headWidth, subWidth + track * gaps);
      fit.style.transform = `scale(${widest > room ? room / widest : 1})`;
    };

    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      live = false;
      window.removeEventListener('resize', measure);
    };
  }, [headline, subline]);

  return { headRef, subRef, fitRef };
}

function PlainWordmark({
  headline,
  subline,
  ink,
  reducedMotion,
}: {
  headline: string;
  subline: string;
  ink: string;
  reducedMotion: boolean;
}) {
  const { headRef, subRef, fitRef } = useLockupTracking(headline, subline);

  return (
    /*
      OUTER = pixel shift. This screen is always-on at a front desk, so the
      wordmark must never sit on the same pixels. Commercial-signage practice is
      a few px of imperceptible drift on a slow cycle; 3min is well inside the
      ~15min content-rotation interval signage firmware uses.

      INNER = the waiting beat. A slow breath reads as "awake and waiting"
      rather than "frozen", and keeps the lit pixels cycling.

      Reduced motion kills both: an always-on sign is exactly where a vestibular
      trigger has no escape.
    */
    <motion.div
      className="flex flex-col items-center"
      animate={reducedMotion ? undefined : { x: [0, 10, 0, -10, 0], y: [0, -8, 6, -6, 0] }}
      transition={{ duration: 180, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.div
        className="flex select-none flex-col items-center font-sans leading-none text-[clamp(5rem,15vw,22rem)]"
        animate={reducedMotion ? undefined : { opacity: [1, 0.72, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/*
          `italic` resolves to Inter's REAL italic cut, loaded for this one
          consumer in src/lib/fonts.ts — never a browser-synthesised oblique.
          The cut is its own non-preloaded `next/font` call (`cfSansItalic`), so
          the wordmark below names that family explicitly; the app's sans var
          carries the upright faces only and every other document stops paying
          for three italic files it never renders.
          Inter is also the tenant's own face: usavshop.com serves it, and it is
          already the house sans, so the brand's exact type needs no new family.

          This wrapper owns the fit scale. It is a plain div on purpose: the two
          motion parents already write `transform`, and a third writer on the
          same node would fight them frame by frame.
        */}
        <div ref={fitRef} className="flex flex-col items-center">
          <span
            ref={headRef}
            className="-mr-[0.08em] text-[1em] font-semibold italic tracking-[0.08em]"
            style={{ color: ink, fontFamily: 'var(--font-cf-sans-italic)' }}
          >
            {headline}
          </span>
          <span ref={subRef} className="mt-[0.08em] text-[0.33em] font-normal text-black">
            {subline}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

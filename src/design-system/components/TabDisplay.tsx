'use client';

/**
 * TabDisplay — industrial SoT tab / mode switcher (SpaceX / Grok closed geometry).
 *
 * Zero corner radius. No soft pills / capsules. Motion via `@/design-system/motion`.
 *
 * Hierarchy (parent above child, cascading weight):
 * - `appearance="underline"` — **parent** nav (Chat·Claim, Browse·Move·Send):
 *   larger type, flush underline on active — no inverse fill.
 * - `appearance="segment"` — **child** local toggle (New ticket·Link existing):
 *   muted sunken rail + light rectangular active face, smaller type.
 * - `appearance="fill"` — high-contrast inverse sliding face (legacy nested fill).
 *
 * Densities:
 * - `nested` (default) — Displays verb / claim mode switchers
 * - `band` — workbench lifecycle strip sizing (API ready; consumers still on TabSwitch)
 * - `icon` — quiet Displays topic strip (SectionTabsSlider density=icon;
 *   flush + underline active — industrial, not soft pill)
 *
 * Soft Linear-style pills live on legacy {@link TabSwitch} `variant="solid"` until
 * workbench bands migrate.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface TabDisplayItem {
  id: string;
  label: string;
  count?: number;
  icon?: (props: { className?: string }) => ReactNode;
  /**
   * When true, render a vertical hairline immediately before this tab
   * (outside the button so the sliding face measurement stays aligned).
   */
  dividerBefore?: boolean;
}

type TabDisplayDensity = 'nested' | 'band' | 'icon';
type TabDisplayFit = 'fill' | 'hug';
type TabDisplayTone = 'inverse' | 'accent';
/**
 * Visual weight in a parent→child stack.
 * `underline` = parent · `segment` = child · `fill` = inverse sliding face.
 */
type TabDisplayAppearance = 'fill' | 'underline' | 'segment';

interface TabDisplayProps {
  tabs: TabDisplayItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  /**
   * `nested` (default) — Displays verb switcher (~32–36px).
   * `band` — ~40px flush workbench strip sizing.
   * `icon` — reserved; quiet topic strip still lives on SectionTabsSlider.
   */
  density?: TabDisplayDensity;
  /**
   * `fill` — track stretches; tabs share width.
   * `hug` — rail sizes to content (Displays nested verbs).
   */
  fit?: TabDisplayFit;
  /** Active-face fill when `appearance="fill"`. `inverse` (default) or `accent`. */
  tone?: TabDisplayTone;
  /**
   * `underline` — parent nav (bottom rule on active).
   * `segment` — child local toggle (sunken rail + light active face).
   * `fill` — inverse sliding face (default for back-compat).
   */
  appearance?: TabDisplayAppearance;
  /** Optional control inside the rail after the tabs (not measured by the face). */
  trailing?: ReactNode;
  'aria-label'?: string;
}

export function TabDisplay({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  density = 'nested',
  fit = 'hug',
  tone = 'inverse',
  appearance = 'fill',
  trailing,
  'aria-label': ariaLabel = 'Tabs',
}: TabDisplayProps) {
  const hug = fit === 'hug';
  const band = density === 'band';
  const accent = tone === 'accent';
  const underline = appearance === 'underline';
  const segment = appearance === 'segment';
  const flush = cornerClass('flush');

  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [face, setFace] = useState({ left: 0, width: 0 });
  const hasPlacedFaceRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const measureFace = useCallback(() => {
    const track = trackRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!track || !btn) {
      setFace((prev) => ({ ...prev, width: 0 }));
      return;
    }
    setFace({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeTab]);

  useLayoutEffect(() => {
    measureFace();
    const id = requestAnimationFrame(() => measureFace());
    return () => cancelAnimationFrame(id);
  }, [measureFace, tabs]);

  useEffect(() => {
    const track = trackRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureFace());
    ro.observe(track);
    if (btn) ro.observe(btn);
    return () => ro.disconnect();
  }, [activeTab, measureFace, tabs]);

  useEffect(() => {
    window.addEventListener('resize', measureFace);
    return () => window.removeEventListener('resize', measureFace);
  }, [measureFace]);

  const facePlaced = hasPlacedFaceRef.current;
  const faceTransition =
    prefersReducedMotion || !facePlaced
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 400, damping: 36, mass: 0.78 };
  useEffect(() => {
    if (face.width > 0) hasPlacedFaceRef.current = true;
  }, [face.width]);

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        flush,
        underline
          ? 'border-b border-border-default bg-transparent'
          : segment
            ? 'border border-border-hairline bg-surface-sunken'
            : 'border border-border-default bg-surface-sunken',
        underline
          ? hug
            ? 'inline-flex h-9 w-auto max-w-full items-stretch'
            : 'flex h-9 w-full items-stretch'
          : cn(
              // `fill` keeps a sunken gutter (`p-0.5`) so its inverse face reads
              // as inset. `segment` does NOT: it is a child toggle sitting
              // directly under a parent underline strip, and a 2px gutter around
              // a light face on a light rail renders as a floating capsule —
              // spacing doing the job the hairline border already does. Flush
              // face, edge to edge; band was already flush.
              band ? 'h-10 p-0' : segment ? 'h-8 p-0' : 'p-0.5',
              hug
                ? cn(
                    'inline-flex w-auto max-w-full items-stretch',
                    segment ? 'h-8' : 'h-9',
                  )
                : 'flex w-full items-stretch',
            ),
        className,
      )}
    >
      <div
        ref={trackRef}
        className={cn(
          'relative flex h-full items-stretch',
          underline ? 'gap-0' : 'gap-0',
          hug ? 'w-max' : 'w-full',
        )}
      >
        {/* Sliding indicator — underline bar OR filled face */}
        <motion.div
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-0',
            flush,
            underline
              ? 'bottom-0 top-auto h-0.5 bg-text-default'
              : segment
                ? 'inset-y-0 bg-surface-card'
                : accent
                  ? 'inset-y-0 bg-accent-bg'
                  : 'inset-y-0 bg-surface-inverse',
          )}
          style={underline ? undefined : { top: 0, bottom: 0 }}
          initial={false}
          animate={{
            left: face.left,
            width: face.width,
            opacity: face.width > 0 ? 1 : 0,
          }}
          transition={faceTransition}
        />
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <div key={tab.id} className="contents">
              {tab.dividerBefore ? (
                <span
                  aria-hidden
                  className="my-1 w-px shrink-0 self-stretch bg-border-hairline"
                />
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                ref={(node) => {
                  buttonRefs.current[tab.id] = node;
                }}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'relative z-10 flex h-full min-w-[3rem] items-center justify-center gap-1.5',
                  'whitespace-nowrap transition-colors duration-150',
                  flush,
                  hug ? 'shrink-0' : 'flex-1',
                  focusRing('control', 'accent'),
                  underline
                    ? cn(
                        'px-3 text-role-body font-semibold',
                        isActive
                          ? 'text-text-default'
                          : 'text-text-soft hover:text-text-default',
                      )
                    : segment
                      ? cn(
                          'px-2.5 text-role-caption font-medium',
                          isActive
                            ? 'text-text-default'
                            : 'text-text-soft hover:text-text-default',
                        )
                      : cn(
                          'px-2.5 text-role-caption font-semibold',
                          isActive
                            ? 'text-text-inverse'
                            : 'text-text-soft hover:bg-surface-hover/60 hover:text-text-default',
                        ),
                )}
              >
                <motion.span
                  className="relative z-10 flex items-center justify-center gap-1.5"
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, ease: motionBezier.easeOut }}
                >
                  {Icon ? (
                    <Icon
                      className={cn(
                        'shrink-0',
                        underline ? 'h-4 w-4' : 'h-3.5 w-3.5',
                      )}
                    />
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 ? (
                      <span
                        className={cn(
                          'tabular-nums',
                          isActive ? 'opacity-80' : 'opacity-55',
                        )}
                      >
                        {tab.count > 99 ? '99+' : tab.count}
                      </span>
                    ) : null}
                  </span>
                </motion.span>
              </button>
            </div>
          );
        })}
        {trailing ? (
          <div className="relative z-10 flex shrink-0 items-stretch">{trailing}</div>
        ) : null}
      </div>
    </div>
  );
}

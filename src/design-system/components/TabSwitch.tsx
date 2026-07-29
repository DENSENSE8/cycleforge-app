'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';

interface Tab {
  id: string;
  label: string;
  count?: number;
  /** Optional leading glyph — used by SectionTabsSlider labeled strips. */
  icon?: (props: { className?: string }) => ReactNode;
  color?: 'blue' | 'emerald' | 'orange' | 'purple' | 'green' | 'yellow' | 'gray' | 'red' | 'teal';
  /**
   * When true, render a vertical hairline immediately before this tab
   * (e.g. to separate a secondary/browse group like History). Outside the
   * button so the sliding pill measurement stays aligned.
   */
  dividerBefore?: boolean;
}

interface TabSwitchProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  /** Overrides the default rail container (background, radius, padding). */
  railClassName?: string;
  scrollable?: boolean;
  /** Light gray rail only (no outer chrome); stronger inactive legibility for bright / glare-heavy screens. */
  highContrast?: boolean;
  /**
   * `default` — light pill, semantic tab-color text.
   * `upNext` — station queue: tinted rail, semantic label hues; outline from `stationChromeOutlineClassName`.
   * `solid` — Linear-style dark pill (inverse surface) + white active text, title-case labels on a light rail.
   */
  variant?: 'default' | 'upNext' | 'solid';
  /** When `variant` is `upNext`, 1px outline on rail + sliding pill (e.g. `getTechStationLightChromeOutlineClass`). */
  stationChromeOutlineClassName?: string;
  /**
   * How tab counts render. `badge` (default) = mini pill bubble.
   * `plain` = same size/weight as the label (no bubble) — preferred for dense ops headers.
   */
  countStyle?: 'badge' | 'plain';
  /**
   * `solid` variant only — active-pill fill. `inverse` (default) keeps the
   * Linear-style dark inverse pill; `accent` uses the design-system accent
   * (`bg-accent-bg`, blue) surface. Active label stays `text-text-inverse`
   * (the accent-surface pairing); inactive/hover text is unchanged.
   */
  solidTone?: 'inverse' | 'accent';
  /**
   * `fill` (default) — track stretches; tabs share width (`flex-1`).
   * `hug` — rail sizes to content; tabs stay intrinsic width. Use for
   * compact workbench chrome (e.g. {@link SectionTabsSlider}).
   */
  fit?: 'fill' | 'hug';
  /**
   * Optional control rendered inside the rail after the tabs (e.g. a ⋯
   * overflow trigger). Not measured by the sliding pill.
   */
  trailing?: ReactNode;
}

const colorTextMap: Record<string, { active: string; shadow: string }> = {
  blue:    { active: 'text-blue-600',    shadow: '0 1px 4px 0 rgb(59 130 246 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  emerald: { active: 'text-emerald-600', shadow: '0 1px 4px 0 rgb(16 185 129 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  orange:  { active: 'text-orange-600',  shadow: '0 1px 4px 0 rgb(234 88 12 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  purple:  { active: 'text-purple-600',  shadow: '0 1px 4px 0 rgb(147 51 234 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  green:   { active: 'text-emerald-600', shadow: '0 1px 4px 0 rgb(16 185 129 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  yellow:  { active: 'text-amber-600',   shadow: '0 1px 4px 0 rgb(217 119 6 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  gray:    { active: 'text-text-muted',    shadow: '0 1px 4px 0 rgb(0 0 0 / 0.08), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.05)' },
  red:     { active: 'text-red-600',     shadow: '0 1px 4px 0 rgb(220 38 38 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
  teal:    { active: 'text-teal-600',    shadow: '0 1px 4px 0 rgb(20 184 166 / 0.12), 0 0.5px 1.5px 0 rgb(0 0 0 / 0.06)' },
};

/** Semantic tab label text for `variant="upNext"` (rail/pill outline stays station-themed). */
const upNextLabelTextClass: Record<string, { active: string; inactive: string }> = {
  blue:    { active: 'text-blue-600',    inactive: 'text-blue-500 hover:text-blue-600' },
  emerald: { active: 'text-emerald-600', inactive: 'text-emerald-500 hover:text-emerald-600' },
  green:   { active: 'text-emerald-600', inactive: 'text-emerald-500 hover:text-emerald-600' },
  orange:  { active: 'text-orange-600',  inactive: 'text-orange-500 hover:text-orange-600' },
  purple:  { active: 'text-purple-600',  inactive: 'text-purple-500 hover:text-purple-600' },
  yellow:  { active: 'text-amber-600',   inactive: 'text-amber-500 hover:text-amber-600' },
  gray:    { active: 'text-text-muted',    inactive: 'text-text-soft hover:text-text-muted' },
  red:     { active: 'text-red-600',     inactive: 'text-red-500 hover:text-red-600' },
  teal:    { active: 'text-teal-600',    inactive: 'text-teal-500 hover:text-teal-600' },
};

const upNextRailBaseClass =
  'rounded-xl bg-surface-strong p-1.5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.14)]';

/** Shared chrome for sidebar order/view TabSwitch rows (dashboard, repair, etc.). */
export function SidebarTabSwitchChrome({ children }: { children: ReactNode }) {
  return <div className="border-b border-border-default px-4 py-3">{children}</div>;
}

export function TabSwitch({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  railClassName,
  scrollable = false,
  highContrast = false,
  variant = 'default',
  stationChromeOutlineClassName,
  countStyle = 'badge',
  solidTone = 'inverse',
  fit = 'fill',
  trailing,
}: TabSwitchProps) {
  const upNext = variant === 'upNext';
  const solid = variant === 'solid';
  const solidAccent = solid && solidTone === 'accent';
  const hug = fit === 'hug';
  const upNextOutline = stationChromeOutlineClassName ?? 'border border-border-default';
  const defaultRailClass = upNext
    ? `${upNextRailBaseClass} ${upNextOutline}`
    : solid
      ? 'rounded-full border border-border-default bg-surface-card p-1 shadow-sm'
      : highContrast
        ? 'rounded-xl bg-surface-strong p-1.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]'
        : 'bg-surface-sunken rounded-xl p-1';
  const railCombined = railClassName ?? defaultRailClass;
  const trackWidthClass = scrollable ? 'w-max min-w-full' : hug ? 'w-max' : 'w-full';
  const tabFlexClass = hug ? 'shrink-0' : 'flex-1';
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  // First measured placement must SNAP (no transition), not spring from
  // {left:0,width:0}. `initial={false}` only suppresses the first commit's
  // animation; the follow-up measurement still animates, which for a non-first
  // active tab reads as the pill sweeping across the whole header on mount
  // (worst for a rightmost default, e.g. Unbox "Unboxed"). Snap once, then
  // spring on every later tab change.
  const hasPlacedPillRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const measurePill = useCallback(() => {
    const track = trackRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!track || !btn) {
      setPill((prev) => ({ ...prev, width: 0 }));
      return;
    }
    setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeTab]);

  useLayoutEffect(() => {
    measurePill();
    const id = requestAnimationFrame(() => measurePill());
    return () => cancelAnimationFrame(id);
  }, [measurePill, tabs]);

  useEffect(() => {
    const track = trackRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measurePill());
    ro.observe(track);
    if (btn) ro.observe(btn);
    return () => ro.disconnect();
  }, [activeTab, measurePill, tabs]);

  useEffect(() => {
    window.addEventListener('resize', measurePill);
    return () => window.removeEventListener('resize', measurePill);
  }, [measurePill]);

  useEffect(() => {
    if (!scrollable) return;
    const rail = railRef.current;
    const activeButton = buttonRefs.current[activeTab];
    if (!rail || !activeButton) return;
    const railWidth = rail.clientWidth;
    const maxScroll = Math.max(0, rail.scrollWidth - railWidth);
    if (maxScroll === 0) return;

    // Scroll to the NEAREST edge, and only when the active tab is actually out
    // of view. This used to CENTER the active tab unconditionally, which meant
    // a first tab in an overflowing rail got scrolled half off its own left
    // edge — "Pending 99+" rendering as "ing 99+" on the dashboard the moment
    // the header was narrow enough to overflow. Centering is only ever right
    // for a tab in the middle of a long rail; for the ends it manufactures the
    // clipping it was supposed to prevent.
    const PAD = 8;
    const left = activeButton.offsetLeft;
    const right = left + activeButton.offsetWidth;
    const viewLeft = rail.scrollLeft;
    const viewRight = viewLeft + railWidth;

    let next = viewLeft;
    if (left - PAD < viewLeft) next = left - PAD;
    else if (right + PAD > viewRight) next = right + PAD - railWidth;
    else return;

    const clamped = Math.max(0, Math.min(next, maxScroll));
    requestAnimationFrame(() => {
      rail.scrollTo({ left: clamped, behavior: 'smooth' });
    });
  }, [activeTab, scrollable, tabs]);

  const activeTabColor = tabs.find((t) => t.id === activeTab)?.color ?? 'blue';
  const activeShadow = (colorTextMap[activeTabColor] ?? colorTextMap.blue).shadow;
  const pillShadow = upNext
    ? '0 1px 4px 0 rgb(0 0 0 / 0.16), 0 0.5px 2px 0 rgb(0 0 0 / 0.08)'
    : solid
      ? '0 1px 3px 0 rgb(0 0 0 / 0.22), 0 1px 2px 0 rgb(0 0 0 / 0.10)'
      : activeShadow;
  // Snap the pill to its first non-zero measurement (mount), spring thereafter.
  const pillPlaced = hasPlacedPillRef.current;
  const pillTransition =
    prefersReducedMotion || !pillPlaced
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 400, damping: 36, mass: 0.78 };
  useEffect(() => {
    if (pill.width > 0) hasPlacedPillRef.current = true;
  }, [pill.width]);

  return (
    <div
      ref={railRef}
      className={`${railCombined} ${scrollable ? 'overflow-x-auto scrollbar-hide' : ''} ${
        hug ? 'inline-flex w-auto max-w-full' : ''
      } ${className}`}
    >
      <div ref={trackRef} className={`relative flex gap-1 ${trackWidthClass}`}>
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute z-0 rounded-full ${
            solid ? (solidAccent ? 'bg-accent-bg' : 'bg-surface-inverse') : 'bg-surface-card'
          } ${upNext ? upNextOutline : solid ? '' : 'ring-1 ring-inset ring-border-soft'}`}
          style={{
            top: 0,
            bottom: 0,
            boxShadow: pillShadow,
          }}
          initial={false}
          animate={{
            left: pill.left,
            width: pill.width,
            opacity: pill.width > 0 ? 1 : 0,
          }}
          transition={pillTransition}
        />
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const colors = colorTextMap[tab.color ?? 'blue'] ?? colorTextMap.blue;
          const upNextLabels = upNextLabelTextClass[tab.color ?? 'blue'] ?? upNextLabelTextClass.blue;
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
                ref={(node) => {
                  buttonRefs.current[tab.id] = node;
                }}
                onClick={() => onTabChange(tab.id)}
                className={`relative z-10 ${tabFlexClass} min-w-[3rem] whitespace-nowrap rounded-full transition-colors duration-150 ${
                  solid ? 'font-semibold' : 'font-semibold uppercase tracking-widest'
                } ${
                  upNext
                    ? 'px-3 py-2 text-role-caption'
                    : solid
                      ? hug
                        ? 'px-3 py-2 text-role-caption'
                        : 'px-5 py-2.5 text-role-caption'
                      : highContrast
                        ? 'px-4 py-2 text-role-caption'
                        : 'px-3 py-1.5 text-role-micro'
                } ${
                  upNext
                    ? isActive
                      ? upNextLabels.active
                      : upNextLabels.inactive
                    : solid
                      ? isActive
                        ? 'text-text-inverse'
                        : 'text-text-soft hover:text-text-default'
                      : isActive
                        ? colors.active
                        : highContrast
                          ? 'text-text-default'
                          : 'text-text-soft hover:text-text-muted'
                }`}
              >
                <motion.span
                  className="relative z-10 flex items-center justify-center gap-1.5"
                  animate={{
                    scale: isActive ? 1 : solid ? 1 : upNext || highContrast ? 0.98 : 0.93,
                    opacity: isActive ? 1 : solid || upNext ? 1 : highContrast ? 0.9 : 0.52,
                  }}
                  transition={{ duration: 0.18, ease: motionBezier.easeOut }}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 ? (
                    countStyle === 'plain' ? (
                      <span
                        key={tab.count}
                        className={`tabular-nums ${isActive ? 'opacity-80' : 'opacity-55'}`}
                      >
                        {tab.count > 99 ? '99+' : tab.count}
                      </span>
                    ) : (
                      <motion.span
                        key={tab.count}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                        className={/* ds-allow-spacing — 14px count bubble, deliberate 3px inset */ `inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full text-role-micro tabular-nums leading-none ${
                          upNext
                            ? 'bg-current/[0.14] text-current'
                            : isActive
                              ? 'bg-current/[0.12] text-current'
                              : highContrast
                                ? 'bg-surface-inverse-soft/20 text-text-default'
                                : 'bg-surface-strong/70 text-text-muted'
                        }`}
                      >
                        {tab.count > 99 ? '99+' : tab.count}
                      </motion.span>
                    )
                  ) : null}
                </motion.span>
              </button>
            </div>
          );
        })}
        {trailing ? <div className="relative z-10 flex shrink-0 items-stretch">{trailing}</div> : null}
      </div>
    </div>
  );
}

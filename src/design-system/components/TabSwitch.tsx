'use client';

/**
 * TabSwitch — the segmented tab box (one face only).
 *
 * Callers: KioskDevicesWorkspace, LabelPrinterWorkHeader, DocumentSlideOver,
 * settings/me, the Daily lists' All/Open/Done, the task inspector's Task/Ticket.
 * User: "For the tab switch component remove all the other variants and just
 * keep the segmented" (2026-09-11).
 *
 * INDUSTRIAL (operator 2026-09-23): *"box it off, no corner radius, industrial
 * tabs, smaller and easier to use."* The track and the sliding face are
 * flush-square (`rounded-none`) like the rest of the ops ladder — the old
 * capsule was a soft-ladder exemption this ruling retired — and the faces
 * dropped a size step (caption text, tighter pads) so the box reads as a
 * compact instrument, not a hero control.
 *
 * Former `default` / `upNext` / `solid` faces were deleted 2026-09-11. Tone is
 * only `solidTone` (inverse fill vs accent fill).
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { cornerClass } from '@/design-system/tokens/radius';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';

interface Tab {
  id: string;
  label: string;
  count?: number;
  /** Optional leading glyph. */
  icon?: (props: { className?: string }) => ReactNode;
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
  /**
   * How tab counts render. `badge` (default) = mini pill bubble.
   * `plain` = same size/weight as the label (no bubble) — preferred for dense ops headers.
   */
  countStyle?: 'badge' | 'plain';
  /**
   * Active-face fill.
   * `inverse` (default): black sliding capsule + white label (`bg-surface-inverse`
   * / `text-text-inverse`) — white on black, not staff accent.
   * `accent`: `bg-accent-bg` + inverse label (Kiosk devices).
   */
  solidTone?: 'inverse' | 'accent';
  /**
   * `fill` (default) — track stretches; tabs share width (`flex-1`).
   * `hug` — rail sizes to content; tabs stay intrinsic width.
   */
  fit?: 'fill' | 'hug';
  /**
   * Height / pad scale.
   * `md` (default) = rail `p-1` + `px-4 py-1.5` faces.
   * `sm` = **h-8** rail (matches Button `size="sm"`) + `p-0.5` + caption faces.
   */
  size?: 'md' | 'sm';
  /**
   * Optional control rendered inside the rail after the tabs (e.g. a ⋯
   * overflow trigger). Not measured by the sliding pill.
   */
  trailing?: ReactNode;
}

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
  countStyle = 'badge',
  solidTone = 'inverse',
  fit = 'fill',
  size = 'md',
  trailing,
}: TabSwitchProps) {
  const solidAccent = solidTone === 'accent';
  const hug = fit === 'hug';
  const compact = size === 'sm';
  const defaultRailClass = cn(
    cornerClass('flush'),
    'border border-border-soft bg-surface-sunken',
    compact ? 'h-8 p-0.5' : 'p-1',
  );
  const railCombined = railClassName ?? defaultRailClass;
  // Hug keeps an intrinsic track even when `scrollable` — `min-w-full` would
  // stretch short rails and fight the compact padding.
  const trackWidthClass = hug ? 'w-max' : scrollable ? 'w-max min-w-full' : 'w-full';
  const tabFlexClass = hug ? 'shrink-0' : 'flex-1';
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  // First measured placement must SNAP (no transition), not spring from
  // {left:0,width:0}. Snap once, then spring on every later tab change.
  const hasPlacedPillRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const faceCorner = cornerClass('flush');

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

    // Scroll to the NEAREST edge, and only when the active tab is out of view.
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

  const pillShadow = solidAccent
    ? '0 1px 3px 0 rgb(0 0 0 / 0.12), 0 1px 2px 0 rgb(0 0 0 / 0.06)'
    : '0 1px 2px 0 rgb(0 0 0 / 0.08), 0 1px 3px 0 rgb(0 0 0 / 0.04)';
  const pillPlaced = hasPlacedPillRef.current;
  const pillTransition =
    prefersReducedMotion || !pillPlaced
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.7 };
  useEffect(() => {
    if (pill.width > 0) hasPlacedPillRef.current = true;
  }, [pill.width]);

  return (
    <div
      ref={railRef}
      className={cn(
        railCombined,
        scrollable && 'overflow-x-auto scrollbar-hide',
        hug
          ? compact
            ? 'inline-flex w-auto max-w-full items-stretch'
            : 'inline-flex w-auto max-w-full'
          : compact
            ? 'flex w-full items-stretch'
            : '',
        className,
      )}
    >
      <div
        ref={trackRef}
        className={`relative flex h-full items-stretch gap-0 ${trackWidthClass}`}
      >
        <motion.div
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-0',
            faceCorner,
            solidAccent ? 'bg-accent-bg' : 'bg-surface-inverse',
          )}
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
                className={cn(
                  'relative z-10 min-w-[2.5rem] whitespace-nowrap font-medium tracking-normal transition-colors duration-150',
                  tabFlexClass,
                  faceCorner,
                  hug
                    ? compact
                      ? 'flex h-full items-center px-2.5 text-role-caption'
                      : 'px-3.5 py-1.5 text-role-caption'
                    : compact
                      ? 'flex h-full items-center px-2.5 text-role-caption'
                      : 'px-3.5 py-1.5 text-role-caption',
                  isActive
                    ? 'text-text-inverse'
                    : 'text-text-soft hover:text-text-default',
                )}
              >
                <motion.span
                  className="relative z-10 flex items-center justify-center gap-1.5"
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.18, ease: motionBezier.easeOut }}
                >
                  {Icon ? (
                    <Icon className={navIconStrokeClass('h-3.5 w-3.5 shrink-0')} />
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && countStyle === 'plain' ? (
                      <span
                        key={tab.count}
                        className={cn(
                          'tabular-nums',
                          isActive ? 'opacity-80' : 'opacity-55',
                        )}
                      >
                        {tab.count > 99 ? '99+' : tab.count}
                      </span>
                    ) : null}
                  </span>
                  {tab.count !== undefined && tab.count > 0 && countStyle !== 'plain' ? (
                    <motion.span
                      key={tab.count}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                      className={/* ds-allow-spacing — 14px count bubble, deliberate 3px inset */ `inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full text-role-micro tabular-nums leading-none ${
                        isActive
                          ? 'bg-current/[0.12] text-current'
                          : 'bg-surface-strong/70 text-text-muted'
                      }`}
                    >
                      {tab.count > 99 ? '99+' : tab.count}
                    </motion.span>
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

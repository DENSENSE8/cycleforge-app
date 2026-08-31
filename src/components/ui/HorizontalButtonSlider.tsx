'use client';

import { Fragment, useCallback, useId, useRef, type RefObject, type WheelEvent } from 'react';
import { motion, useReducedMotion } from '@/design-system/motion';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { appCanvasClass, appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import { sourcePlatformHue, type PlatformHue } from '@/lib/source-platform';

export type HorizontalSliderTone = 'zinc' | 'yellow' | 'emerald' | 'red' | 'blue' | 'orange' | 'purple';

export type HorizontalSliderItem = {
  id: string;
  label: string;
  count?: number;
  /** Used when variant is `fba`. */
  tone?: HorizontalSliderTone;
  /**
   * Leading icon. Used by the `nav` variant where desktop pills collapse to
   * icon-only and reveal the label on hover (or when active). Ignored by
   * other variants.
   */
  icon?: (props: { className?: string }) => JSX.Element;
  /**
   * Renders the pill as a non-interactive placeholder (e.g. "coming soon"
   * sections). Currently honored by the `nav` variant.
   */
  disabled?: boolean;
  /**
   * Status badge overlay — `'dot'` paints a small emerald dot at the top-right
   * of the pill to signal "there's something on this tab" without affecting
   * the click target. Honored by the `nav` variant.
   */
  badge?: 'dot' | null;
};

const FBA_TONE: Record<
  HorizontalSliderTone,
  { activeBg: string; activeText: string; ring: string }
> = {
  zinc: { activeBg: 'bg-surface-sunken', activeText: 'text-text-default', ring: 'ring-border-default' },
  yellow: { activeBg: 'bg-yellow-100', activeText: 'text-black', ring: 'ring-yellow-300' },
  emerald: { activeBg: 'bg-emerald-100', activeText: 'text-black', ring: 'ring-emerald-300' },
  red: { activeBg: 'bg-red-100', activeText: 'text-black', ring: 'ring-red-300' },
  blue: { activeBg: 'bg-blue-100', activeText: 'text-black', ring: 'ring-blue-300' },
  orange: { activeBg: 'bg-orange-100', activeText: 'text-black', ring: 'ring-orange-300' },
  purple: { activeBg: 'bg-purple-100', activeText: 'text-black', ring: 'ring-purple-300' },
};

/**
 * Pinned-hue → slider tone. The slider's palette is narrower than the platform
 * registry's, so near hues are approximated to the closest one it can say
 * (Walmart's amber → orange, Goodwill's sky → blue). The NON-brand hues —
 * Square's slate, Other, unknown — land on the neutral pill instead, because
 * approximating those would mean handing a channel a brand colour it does not
 * have, which is worse than showing it plain.
 */
const TONE_BY_PLATFORM_HUE: Record<PlatformHue, HorizontalSliderTone> = {
  yellow: 'yellow',
  orange: 'orange',
  red: 'red',
  blue: 'blue',
  purple: 'purple',
  green: 'emerald',
  amber: 'orange',
  sky: 'blue',
  slate: 'zinc',
  neutral: 'zinc',
};

/** A channel pill's tone, resolved from the platform registry — never typed here. */
export function platformSliderTone(platformValue: string): HorizontalSliderTone {
  return TONE_BY_PLATFORM_HUE[sourcePlatformHue(platformValue)];
}

/* ── Preset filter items ──
 * NOT a tone source of truth. The workflow presets below (All / Must Go / …)
 * own their own tones because they name a workflow, not a brand. Every CHANNEL
 * preset derives from `source-platform.ts`, which is the one place a platform's
 * colour is defined — this file used to spell "amazon: orange" out again, and a
 * second spelling of a brand colour is a second colour waiting to happen.
 */
export const SLIDER_PRESETS = {
  all:        { id: 'all',      label: 'All',       tone: 'blue'    } as HorizontalSliderItem,
  mustGo:     { id: 'must_go',  label: 'Must Go',   tone: 'red'     } as HorizontalSliderItem,
  newest:     { id: 'newest',   label: 'Newest',    tone: 'emerald' } as HorizontalSliderItem,
  oldest:     { id: 'oldest',   label: 'Oldest',    tone: 'zinc'    } as HorizontalSliderItem,
  amazon:     { id: 'amazon',   label: 'Amazon',    tone: platformSliderTone('amazon') } as HorizontalSliderItem,
  ebay:       { id: 'ebay',     label: 'eBay',      tone: platformSliderTone('ebay')   } as HorizontalSliderItem,
  ecwid:      { id: 'ecwid',    label: 'Ecwid',     tone: platformSliderTone('ecwid')  } as HorizontalSliderItem,
  pending:    { id: 'all',      label: 'Pending',   tone: 'purple'  } as HorizontalSliderItem,
  repair:     { id: 'all',      label: 'All',       tone: 'orange'  } as HorizontalSliderItem,
  stock:      { id: 'all',      label: 'All',       tone: 'red'     } as HorizontalSliderItem,
  receiving:  { id: 'all',      label: 'All',       tone: 'emerald' } as HorizontalSliderItem,
} as const;

function useHorizontalWheelScroll(ref: RefObject<HTMLDivElement | null>) {
  return useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    [ref]
  );
}

export type HorizontalButtonSliderProps = {
  items: HorizontalSliderItem[];
  value: string;
  onChange: (id: string) => void;
  /**
   * Active-state visual language:
   *   - `fba`      — ring pills with per-item tone (FBA filter rows).
   *   - `slate`    — dark pill when active (work-order status).
   *   - `nav`      — filled blue active state matching the global sidebar nav
   *                  (sub-view switchers inside sidebar panels). Adds a subtle
   *                  scale-up on the active pill so the eye locks onto it.
   *   - `floating` — borderless white pills with drop shadows that look like
   *                  Google Maps filter chips floating over content.
   *   - `segmented` — icon-only tabs that split the width evenly (flex-1). The
   *                  active tab is a filled blue square with a sliding indicator;
   *                  inactive tabs are borderless grayed icons. The selection's
   *                  name is meant to live in the sidebar header, not on the tab.
   */
  variant?: 'fba' | 'slate' | 'nav' | 'floating' | 'segmented';
  size?: 'md' | 'lg';
  /**
   * Tighter vertical rhythm for the `nav` variant — drops the scroller's
   * vertical padding to `pt-1 pb-2` so the row fits a ~44px band (32px pill +
   * shadow bleed). Used by header bands that align on the 40px grid.
   */
  dense?: boolean;
  className?: string;
  legend?: string;
  /**
   * When `variant` is `nav`, render icon-only tabs (labels still drive
   * `aria-label` / `title`). Compact square-ish hit targets for tight headers.
   */
  navIconOnly?: boolean;
  /**
   * Opt-in (default off): fade/scale each `segmented` tab in on mount. React only
   * mounts a newly-appended item, so a tab added at runtime (e.g. a Units tab that
   * appears once serials are scanned) animates in on its own while the existing
   * tabs stay put. Reduced-motion collapses it to a plain fade. Ignored by other
   * variants; zero change for existing callers.
   */
  animateItemMount?: boolean;
  /**
   * Square, edge-to-edge segmented track for full-bleed sidebar bands.
   * Drops outer radius, inset padding, and the track
   * ring so the gray fill meets the panel edges.
   */
  segmentedFlush?: boolean;
  /**
   * Sticky overlay inside a scrolling rail — skips the horizontal scroller so
   * `overflow-x-auto` does not clip the active pill's drop shadow. Use with
   * {@link sidebarNavOverlayBandClass} on the wrapper.
   */
  overlay?: boolean;
  'aria-label'?: string;
};

export function HorizontalButtonSlider({
  items,
  value,
  onChange,
  variant = 'fba',
  size = 'md',
  dense = false,
  className = '',
  legend,
  navIconOnly = false,
  segmentedFlush = false,
  overlay = false,
  animateItemMount = false,
  'aria-label': ariaLabel,
}: HorizontalButtonSliderProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const onWheel = useHorizontalWheelScroll(scrollerRef);
  const prefersReducedMotion = useReducedMotion();
  // Mount motion (opt-in) for `segmented` / `nav` tabs — React only mounts a
  // newly-appended item, so a tab added at runtime animates itself in.
  const mountInitial = animateItemMount
    ? prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.6 }
    : false;
  // Stable per-instance id so each `segmented` slider animates its own indicator
  // (sharing a layoutId across instances would make pills teleport between them).
  const indicatorId = useId();

  const sizeCls =
    size === 'lg'
      ? 'min-h-10 px-3.5 py-2 text-role-micro tracking-wide'
      : 'h-7 px-3 text-role-eyebrow tracking-wide';

  // The `nav` variant uses scale-up + shadow on the active pill. Setting
  // overflow-x-auto forces overflow-y to compute as auto too (CSS spec), so
  // drop shadows get clipped unless the scroller has extra bottom padding.
  // Dense nav: pt-1 + h-7 pills + pb-2 sits inside PRIMARY_CHROME_ROW_FACE
  // sidebar pill bands; non-dense keeps more bottom pad for scale-up bleed.
  const scrollerPadY =
    variant === 'nav' ? (dense ? 'pt-1 pb-2' : 'pt-2 pb-3') : 'pb-0.5';

  // `floating` and `segmented` skip the scroller — floating so its wrapped
  // pills can grow the sidebar naturally, segmented so flex-1 children
  // stretch. Overlay nav USED to skip it unconditionally too (to avoid
  // overflow-x-auto clipping the active pill's scale-up/shadow bleed), but
  // every real consumer of `overlay` also passes `dense` — and dense pills
  // never scale-animate (see `isActive && !isDisabled && !dense` below), so
  // that bleed never actually happens for `overlay`+`dense`. Skipping the
  // scroller instead just made the row `flex-wrap` once pills ran out of room
  // (e.g. a 4th Triage/Prioritize/Unfound/Done tab wrapping to its own line).
  // Dense overlay nav now scrolls horizontally like every other pill row; a
  // hypothetical future non-dense overlay still gets the old overflow-visible
  // treatment so its shadow bleed stays unclipped.
  const isSegmented = variant === 'segmented';
  const isOverlayNav = overlay && variant === 'nav';
  const useScroller = variant !== 'floating' && !isSegmented && !(isOverlayNav && !dense);
  const containerClass = isSegmented
    ? segmentedFlush
      ? // Full-bleed chrome band: no bottom hairline (join is the desktop
        // content shell radius stroke, not stacked chrome rules).
        cn('h-full rounded-none p-0', appChromeClass)
      :         // Recessed gray track (canvas + inset ring) so the active blue
        // pill reads as raised. p-1 + h-7 tabs = ops chrome row height.
        // Flush-square (zero-radius ops chrome).
        cn('rounded-none p-1 ring-1 ring-inset ring-border-soft', appCanvasClass)
    : useScroller
      ? `-mx-1 min-w-0 overflow-x-auto overscroll-x-contain ${scrollerPadY} [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`
      : 'overflow-visible pt-2 pb-3';

  return (
    <div className={cn(useScroller && 'min-w-0', className)}>
      {legend ? (
        <span className="mb-1.5 block text-role-micro uppercase tracking-widest text-text-faint">
          {legend}
        </span>
      ) : null}
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={ariaLabel || legend || 'Filter'}
        onWheel={useScroller ? onWheel : undefined}
        className={containerClass}
      >
        <div
          className={
            isSegmented
              ? segmentedFlush
                ? 'flex h-full gap-0'
                : 'flex gap-1'
              : useScroller
                ? 'flex min-w-max snap-x snap-mandatory gap-2 px-1'
                : 'flex flex-wrap gap-2'
          }
        >
          {items.map((item) => {
            const isActive = value === item.id;
            if (variant === 'segmented') {
              const Icon = item.icon;
              const segTabClass = segmentedFlush
                ? cn(
                    'relative flex h-full flex-1 items-center justify-center rounded-none',
                    PRIMARY_CHROME_ROW_FACE,
                  )
                : 'relative flex h-8 flex-1 items-center justify-center rounded-none';
              const segIndicatorClass = segmentedFlush
                ? 'absolute inset-0 rounded-none bg-blue-600'
                : 'absolute inset-0 rounded-none bg-blue-600 shadow-sm shadow-blue-600/25';
              const tab = (
                <motion.button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={item.label}
                  initial={mountInitial}
                  animate={animateItemMount ? { opacity: 1, scale: 1 } : undefined}
                  whileTap={{ scale: 0.94 }}
                  transition={framerTransition.sliderIndicator}
                  onClick={() => onChange(item.id)}
                  className={`${segTabClass} transition-colors ${
                    isActive ? 'text-white' : 'text-text-muted hover:text-text-default'
                  }`}
                >
                  {isActive ? (
                    <motion.span
                      layoutId={`${indicatorId}-seg`}
                      className={segIndicatorClass}
                      transition={framerTransition.sliderIndicator}
                    />
                  ) : null}
                  {Icon ? <Icon className={navIconStrokeClass('relative z-10 h-[18px] w-[18px]')} /> : null}
                  {item.badge === 'dot' ? (
                    <span className="absolute right-1.5 top-1.5 z-10 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                  ) : null}
                </motion.button>
              );
              // Active mode name lives in the sidebar header — tooltip only for
              // inactive tabs, pinned below the icon so it doesn't cover the rail.
              if (isActive) {
                return <Fragment key={item.id}>{tab}</Fragment>;
              }
              return (
                <Fragment key={item.id}>
                  <HoverTooltip label={item.label} placement="below" asChild>
                    {tab}
                  </HoverTooltip>
                </Fragment>
              );
            }
            if (variant === 'nav') {
              const Icon = item.icon;
              const isDisabled = !!item.disabled;
              // `dense` pills lock to ops chrome height (h-7) with no active
              // scale-up so they sit cleanly inside PRIMARY_CHROME_ROW_FACE
              // sidebar / workbench pill bands.
              const navSizeCls = navIconOnly
                ? 'h-7 w-7 min-w-7 shrink-0 justify-center p-0'
                : dense
                  ? 'h-7 shrink-0 px-3 text-role-eyebrow tracking-wide'
                  : sizeCls;
              const labelClass = Icon ? 'ml-1.5 max-w-[160px]' : 'max-w-[160px]';
              const stateClass = isDisabled
                ? 'cursor-not-allowed bg-surface-canvas text-text-faint ring-border-soft'
                : isActive
                  ? 'bg-blue-600 text-white ring-blue-600 shadow-md shadow-blue-600/25'
                  : 'bg-surface-card text-text-soft ring-border-soft hover:bg-surface-hover hover:text-text-default hover:ring-border-default';
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-disabled={isDisabled || undefined}
                  aria-label={isDisabled ? `${item.label} (coming soon)` : item.label}
                  title={isDisabled ? `${item.label} (coming soon)` : item.label}
                  disabled={isDisabled}
                  initial={mountInitial}
                  animate={{
                    scale: isActive && !isDisabled && !dense ? 1.04 : 1,
                    ...(animateItemMount ? { opacity: 1 } : {}),
                  }}
                  transition={framerTransition.sliderIndicator}
                  whileTap={isDisabled ? undefined : { scale: 0.96 }}
                  onClick={isDisabled ? undefined : () => onChange(item.id)}
                  className={`group relative inline-flex snap-start items-center whitespace-nowrap rounded-none font-semibold uppercase transition-colors ring-1 ring-inset ${navSizeCls} ${stateClass}`}
                >
                  {Icon ? (
                    <Icon
                      className={navIconStrokeClass(
                        `shrink-0 ${navIconOnly ? 'h-3 w-3' : 'h-3.5 w-3.5'}`,
                      )}
                    />
                  ) : null}
                  {navIconOnly ? null : (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className={`inline-block whitespace-nowrap ${labelClass}`}>{item.label}</span>
                      {item.count != null && item.count > 0 ? (
                        <>
                          <span
                            className={`shrink-0 ${isActive ? 'text-white/60' : 'text-text-faint'}`}
                            aria-hidden
                          >
                            •
                          </span>
                          <span className="shrink-0 tabular-nums">{item.count}</span>
                        </>
                      ) : null}
                    </span>
                  )}
                  {item.badge === 'dot' ? (
                    <span
                      className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ${
                        isActive ? 'bg-surface-card ring-blue-600' : 'bg-emerald-500 ring-white'
                      }`}
                      aria-hidden
                    />
                  ) : null}
                </motion.button>
              );
            }

            if (variant === 'floating') {
              const Icon = item.icon;
              const stateClass = isActive
                ? 'bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)]'
                : 'bg-surface-card text-text-muted shadow-[0_1px_4px_rgba(15,23,42,0.14)] hover:bg-surface-hover';
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={item.label}
                  animate={{ scale: isActive ? 1.04 : 1 }}
                  transition={framerTransition.sliderIndicator}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onChange(item.id)}
                  className={`group relative inline-flex snap-start items-center whitespace-nowrap rounded-none font-semibold uppercase transition-colors ${sizeCls} ${stateClass}`}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
                  <span className={`inline-block whitespace-nowrap ${Icon ? 'ml-1.5' : ''} max-w-[160px]`}>
                    {item.label}
                  </span>
                  {item.count != null && item.count > 0 ? (
                    <span className={`ml-1.5 shrink-0 tabular-nums ${isActive ? 'opacity-90' : 'opacity-70'}`}>{item.count}</span>
                  ) : null}
                </motion.button>
              );
            }

            if (variant === 'slate') {
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  animate={{ scale: isActive ? 1.03 : 1 }}
                  transition={framerTransition.sliderIndicator}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onChange(item.id)}
                  className={`snap-start whitespace-nowrap rounded-none border font-semibold uppercase transition-colors ${sizeCls} ${
                    isActive
                      ? 'border-border-strong bg-surface-inverse text-white shadow-md shadow-gray-900/20'
                      : 'border-border-soft bg-surface-card text-text-muted hover:border-border-default hover:bg-surface-hover'
                  }`}
                >
                  {item.label}
                  {item.count != null && item.count > 0 ? (
                    <span className="ml-1.5 tabular-nums opacity-80">{item.count}</span>
                  ) : null}
                </motion.button>
              );
            }

            const tone = FBA_TONE[item.tone ?? 'zinc'];
            return (
              <motion.button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                animate={{ scale: isActive ? 1.03 : 1 }}
                transition={framerTransition.sliderIndicator}
                whileTap={{ scale: 0.92 }}
                onClick={() => onChange(item.id)}
                className={`snap-start whitespace-nowrap rounded-none font-semibold uppercase transition-colors ring-1 ring-inset ${sizeCls} ${
                  isActive
                    ? `${tone.activeBg} ${tone.activeText} ${tone.ring}`
                    : 'bg-surface-card text-text-faint ring-border-soft hover:bg-surface-hover hover:text-text-muted'
                }`}
              >
                {item.label}
                {item.count != null && item.count > 0 ? (
                  <span className="ml-1.5 tabular-nums opacity-90">{item.count}</span>
                ) : null}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

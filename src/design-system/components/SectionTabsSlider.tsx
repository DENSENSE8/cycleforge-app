'use client';

/**
 * SectionTabsSlider — a compact icon tab slider for switching a workspace region
 * between whole contextual displays (e.g. the unbox line detail vs the
 * Units-on-carton rollup). Unlike a bare tab bar, it owns the CONTENT too: the
 * caller passes tabs with their `content`, and the slider renders the bar plus
 * the active panel under ONE container — panels stay mounted (`hidden`) so
 * per-panel state survives switching.
 *
 * - Hover labels use {@link HoverTooltip} (icon-only pills).
 * - The active pill is a sliding indicator (`layoutId`); a tab added at runtime
 *   (e.g. Units once a serial is scanned) animates its pill in.
 * - With a single tab there is no bar — it renders exactly like the plain
 *   display, and the switcher only appears once a second display exists.
 */

import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { framerTransition, motionBezier } from '@/design-system/foundations/motion-framer';

export interface SectionTab {
  id: string;
  /** Accessible name — shown as the pill's hover tooltip. */
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  content: ReactNode;
}

export function SectionTabsSlider({
  tabs,
  value,
  onChange,
  ariaLabel = 'Section displays',
  className,
  rightSlot,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  /** Context control pinned to the right of the bar row (e.g. an Edit-PO pencil). */
  rightSlot?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const pillId = useId();
  // Fall back to the first tab if the selected display is no longer available
  // (e.g. Units selected, then its serials removed) — no stranded blank panel.
  const activeId = tabs.some((t) => t.id === value) ? value : tabs[0]?.id;
  const activeTab = tabs.find((t) => t.id === activeId);
  const showPills = tabs.length > 1;

  return (
    <div className={className ? `space-y-4 ${className}` : 'space-y-4'}>
      {showPills || rightSlot ? (
        <div className="flex min-h-8 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {showPills ? (
              <div
                role="tablist"
                aria-label={ariaLabel}
                className="inline-flex items-center gap-1 rounded-xl bg-surface-canvas p-1 ring-1 ring-inset ring-border-soft"
              >
                <AnimatePresence initial={false}>
                  {tabs.map((tab) => {
                    const active = tab.id === activeId;
                    const Icon = tab.icon;
                    return (
                      <motion.div
                        key={tab.id}
                        // No `layout` — it animates a freshly-mounted pill in from
                        // the layout origin (top-left). Scale from center keeps the
                        // motion in place; the active pill's `layoutId` slides.
                        style={{ transformOrigin: 'center' }}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.18, ease: motionBezier.easeOut }}
                      >
                        <HoverTooltip label={tab.label} placement="below" focusable={false} asChild>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={tab.label}
                            onClick={() => onChange(tab.id)}
                            className={`relative flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
                              active ? 'text-white' : 'text-text-muted hover:text-text-default'
                            }`}
                          >
                            {active ? (
                              <motion.span
                                layoutId={`${pillId}-active`}
                                className="absolute inset-0 rounded-lg bg-blue-600 shadow-sm shadow-blue-600/25"
                                transition={framerTransition.sliderIndicator}
                              />
                            ) : null}
                            <Icon className="relative z-10 h-4 w-4" />
                          </button>
                        </HoverTooltip>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : null}
            {/* Name the active display — don't rely on the icon alone. */}
            {activeTab ? (
              <span className="truncate text-role-eyebrow font-black uppercase tracking-widest text-text-muted">
                {activeTab.label}
              </span>
            ) : null}
          </div>
          {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
        </div>
      ) : null}

      {/* One content region — the active panel shows; the rest stay mounted + hidden. */}
      <div>
        {tabs.map((tab) => (
          <div key={tab.id} role="tabpanel" hidden={tab.id !== activeId}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

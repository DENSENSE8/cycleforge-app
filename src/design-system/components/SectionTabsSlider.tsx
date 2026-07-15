'use client';

/**
 * SectionTabsSlider — a compact icon tab slider for switching a workspace region
 * between whole contextual displays (e.g. the unbox line detail vs the
 * Units-on-carton rollup). Unlike a bare tab bar, it owns the CONTENT too: the
 * caller passes tabs with their `content`, and the slider renders the bar plus
 * the active panel under ONE container — panels stay mounted (`hidden`) so
 * per-panel state survives switching.
 *
 * - Hover labels use {@link HoverTooltip} (icon-only pills in a recessed track).
 * - The active pill is a sliding indicator (`layoutId`); a tab added at runtime
 *   (e.g. Units once a serial is scanned) animates its pill in.
 * - With a single tab there is no bar — it renders exactly like the plain
 *   display, and the switcher only appears once a second display exists.
 */

import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { framerTransition, motionBezier } from '@/design-system/foundations/motion-framer';
import { operatorAccentClasses } from '@/utils/operator-accent';

export interface SectionTab {
  id: string;
  /** Accessible name — shown as the pill's hover tooltip and active label. */
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  content: ReactNode;
  count?: number;
}

function resolveActiveTabId(tabIds: string[], value: string): string | undefined {
  if (tabIds.some((id) => id === value)) return value;
  return tabIds[0];
}

export function SectionTabsSlider({
  tabs,
  value,
  onChange,
  ariaLabel = 'Section displays',
  className,
  rightSlot,
  showActiveLabel = true,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  /** Context control pinned to the right of the bar row (e.g. an Edit-PO pencil). */
  rightSlot?: ReactNode;
  /** Name the active display beside the pills. Default true. */
  showActiveLabel?: boolean;
}) {
  const reduce = useReducedMotion();
  const pillId = useId();
  const activeId = resolveActiveTabId(
    tabs.map((t) => t.id),
    value,
  );
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
                                className={`absolute inset-0 rounded-lg ${operatorAccentClasses.activePill}`}
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
            {showActiveLabel && activeTab ? (
              <span className="truncate text-role-eyebrow font-black uppercase tracking-widest text-text-muted">
                {activeTab.label}
              </span>
            ) : null}
          </div>
          {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
        </div>
      ) : null}

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

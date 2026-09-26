'use client';

import { useState, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { Layer } from '@/design-system/primitives/Layer';
import { Filter, X, ChevronDown } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

export interface FilterRefinement {
  id: string;
  label: string;
  onRemove: () => void;
  /** Optional tone-specific pill chrome (e.g. incoming status facet colors). */
  pillClassName?: string;
}

export interface FilterRefinementBarProps {
  /** Primary label shown on the bar (e.g., "Filters", "Shipment Filters") */
  label?: string;
  /** List of active refinements to show as pills below the bar */
  refinements?: FilterRefinement[];
  /** Optional count override for the badge (defaults to refinements.length) */
  activeCount?: number;
  /** Render function for the dropdown content */
  renderDropdown: (onClose: () => void) => ReactNode;
  /** Callback to clear all active filters */
  onClearAll?: () => void;
  /** Whether to use the compact sidebar styling (40px height, flush borders) */
  variant?: 'default' | 'sidebar';
  /**
   * Dim/blur the page behind the open popover. Defaults to false — the overlay
   * stays a transparent click-catcher so the rest of the page isn't grayed out.
   */
  dimBackdrop?: boolean;
  /** Additional styling for the container */
  className?: string;
  /** Additional styling for the trigger bar */
  barClassName?: string;
}

/** FilterRefinementBar */
export function FilterRefinementBar({
  label = 'Filters',
  refinements = [],
  activeCount,
  renderDropdown,
  onClearAll,
  variant = 'default',
  dimBackdrop = false,
  className = '',
  barClassName = '',
}: FilterRefinementBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = activeCount ?? refinements.length;
  const hasActive = count > 0;
  const isSidebar = variant === 'sidebar';

  const triggerClasses = isSidebar
    ? cn(
        'flex w-full items-center gap-2.5 bg-surface-card px-3 transition-colors hover:bg-surface-hover',
        PRIMARY_CHROME_ROW_FACE,
        isOpen || hasActive ? 'text-blue-600' : 'text-text-soft',
      )
    : `flex w-full items-center gap-3 rounded-none border px-5 py-3 text-role-data font-semibold tracking-tight transition-all ${
        isOpen
          ? 'border-blue-500/50 bg-surface-card shadow-[0_0_20px_rgba(59,130,246,0.12)] ring-1 ring-blue-500/20'
          : hasActive
          ? 'border-blue-200 bg-blue-50/50 text-blue-700 hover:border-blue-300 hover:bg-blue-50'
          : 'border-border-soft bg-surface-card text-text-muted hover:border-border-default hover:bg-surface-hover shadow-sm'
      }`;

  return (
    <div ref={containerRef} className={`relative ${isSidebar ? '' : 'space-y-4'} ${className}`}>
      {/* ── Trigger Bar ────────────────────────────────────────────── */}
      <motion.button
        type="button"
        whileTap={{ scale: isSidebar ? 1 : 0.985 }}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`${triggerClasses} ${barClassName}`}
      >
        <div className={isSidebar ? 'shrink-0' : `flex h-6 w-6 items-center justify-center rounded-none transition-colors ${
          isOpen || hasActive ? 'bg-blue-600 text-white' : 'bg-surface-sunken text-text-faint'
        }`}>
          <Filter className={isSidebar ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        </div>
        
        <span className={`flex-1 text-left ${isSidebar ? 'text-role-micro uppercase tracking-wider' : 'uppercase tracking-wider text-role-caption'}`}>
          {label}
        </span>

        {hasActive && (
          <motion.span 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`flex items-center justify-center rounded-full bg-blue-600 font-semibold text-white shadow-sm shadow-blue-600/20 ${
              isSidebar ? 'h-4 min-w-[16px] px-1 text-role-eyebrow' : 'h-5 min-w-[20px] px-1.5 text-role-micro'
            }`}
          >
            {count}
          </motion.span>
        )}

        <ChevronDown 
          className={`shrink-0 transition-transform duration-300 ease-[0.22,1,0.36,1] ${
            isSidebar ? 'h-3.5 w-3.5' : 'h-4 w-4'
          } ${isOpen ? 'rotate-180 text-blue-600' : 'text-text-faint'}`} 
        />
      </motion.button>

      {/* ── Dropdown Popover (Glassmorphic) ───────────────────────────── Portaled via AnchoredLayer so the popover (and its high z) escapes any… */}
      {dimBackdrop && isOpen ? (
        <Layer level="dropdown">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-scrim/5 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
        </Layer>
      ) : null}
      <AnchoredLayer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={containerRef}
        placement="bottom-stretch"
        gap={8}
        ignoreClickSelector="[data-radix-popper-content-wrapper]"
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
          className="overflow-hidden rounded-none border border-border-default bg-surface-card p-1 shadow-md"
        >
          <div className="max-h-[70vh] overflow-y-auto px-5 py-6">
            {renderDropdown(() => setIsOpen(false))}
          </div>
        </motion.div>
      </AnchoredLayer>

      {/* ── Active Refinement Pills (Clean) ────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {refinements.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-wrap items-center gap-2 px-1"
          >
            {refinements.map((ref) => (
              <motion.button
                layout
                key={ref.id}
                type="button"
                onClick={ref.onRemove}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'group inline-flex items-center gap-2 rounded-none px-3.5 py-1.5 text-role-caption font-semibold shadow-sm ring-1 ring-inset transition-all',
                  ref.pillClassName ??
                    'bg-surface-card text-text-default ring-border-soft hover:ring-blue-300',
                )}
              >
                {ref.pillClassName ? null : (
                  <span className="text-blue-600/60 transition-colors group-hover:text-blue-600">#</span>
                )}
                {ref.label}
                <X
                  className={cn(
                    'h-3 w-3 transition-colors',
                    ref.pillClassName
                      ? 'text-current opacity-50 group-hover:opacity-80'
                      : 'text-text-faint group-hover:text-text-default',
                  )}
                />
              </motion.button>
            ))}

            {onClearAll && (
              <motion.button
                layout
                type="button"
                onClick={onClearAll}
                className="ml-1 text-role-caption font-semibold uppercase tracking-widest text-text-faint hover:text-red-500 transition-colors"
              >
                Clear all
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

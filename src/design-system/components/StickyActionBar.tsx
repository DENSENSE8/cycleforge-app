'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronDown, Loader2 } from '@/components/Icons';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { Popover } from '@/design-system/primitives/Popover';
import { cn } from '@/utils/_cn';

export type StickyActionTone = 'blue' | 'emerald' | 'orange' | 'violet' | 'red' | 'gray';

type StickyActionDensity = 'comfortable' | 'compact';

export interface StickyActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  tone?: StickyActionTone;
  /** Override the tone palette with arbitrary Tailwind classes — used when the
   *  caller drives color from a dynamic source (e.g. station theme per row). */
  toneClasses?: { bg: string; hover: string };
  icon?: ReactNode;
  /** Title attribute for the main CTA (helps explain disabled states). */
  title?: string;
  /** Optional split-button menu — chevron opens an upward menu on click
   *  (Escape / outside click dismiss). */
  menu?: StickyActionMenuItem[];
  /** aria-label for the chevron trigger. Defaults to "More actions". */
  menuLabel?: string;
  /** title attribute for the chevron trigger. */
  menuTitle?: string;
}

interface SecondaryAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

interface Hint {
  /** Key glyph, e.g. "⏎", "⌘P", "Esc". */
  key: string;
  label: string;
}

interface StickyActionBarProps {
  primary: PrimaryAction;
  secondary?: SecondaryAction;
  hints?: Hint[];
  /** Replaces the keyboard-hint area on the left with arbitrary content
   *  (status badges, counts, etc.). When set, `hints` is ignored. */
  leading?: ReactNode;
  /** Optional error banner rendered above the row. */
  error?: ReactNode;
  /** Layout density — `comfortable` is the default tall CTA;
   *  `compact` uses smaller buttons for in-card bars. */
  density?: StickyActionDensity;
  /** Max width of the inner content. Defaults to `max-w-3xl`. The inner row
   *  is `mx-auto`, so the buttons sit centered — keeping bottom-right FABs
   *  from overlapping the action cluster. */
  maxWidth?: string;
  /** When true, the primary CTA stretches to the full inner width (e.g. sidebar
   *  receiving workspace). Hints/leading sit above when present. */
  primaryFullWidth?: boolean;
  /** Pin `leading` / hints on their own row above the action buttons — for narrow
   *  sidebar panels where a side-by-side layout clips the count label. */
  stackLeading?: boolean;
  /** Floating variant — instead of a full-bleed bar, render just the CTA hovering above the scroll surface with no… */
  floating?: boolean;
  /** Extra class on the outer wrapper (override bg, padding, etc.). */
  className?: string;
  /** Applied to the row that contains primary/secondary actions. */
  actionRowClassName?: string;
}

const TONE_BG: Record<StickyActionTone, string> = {
  blue: 'bg-blue-600 hover:bg-blue-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  orange: 'bg-orange-600 hover:bg-orange-700',
  violet: 'bg-violet-700 hover:bg-violet-800',
  red: 'bg-rose-600 hover:bg-rose-700',
  gray: 'bg-surface-inverse hover:bg-surface-inverse-hover',
};

/** Solid fill only — split track uses filter hover so chevron + label stay one tone. */
const TONE_BG_SOLID: Record<StickyActionTone, string> = {
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-600',
  orange: 'bg-orange-600',
  violet: 'bg-violet-700',
  red: 'bg-rose-600',
  gray: 'bg-surface-inverse',
};

/** Sticky bottom action bar — the canonical chrome for every "do the thing" surface (receiving, label printer, pairing). */
export function StickyActionBar({
  primary,
  secondary,
  hints,
  leading,
  error,
  density = 'comfortable',
  maxWidth = 'max-w-3xl',
  primaryFullWidth = false,
  stackLeading = false,
  floating = false,
  className,
  actionRowClassName,
}: StickyActionBarProps) {
  const isCompact = density === 'compact';
  const tone = primary.tone ?? 'blue';
  const baseTone = primary.toneClasses
    ? `${primary.toneClasses.bg} ${primary.toneClasses.hover}`
    : TONE_BG[tone];
  const toneClass = primary.disabled
    ? 'cursor-not-allowed bg-surface-strong'
    : baseTone;
  const splitTrackBg = primary.disabled
    ? 'bg-surface-strong'
    : primary.toneClasses
      ? primary.toneClasses.bg
      : TONE_BG_SOLID[tone];

  const primaryHeight = isCompact ? 'h-9' : 'h-12';
  const primaryPadding = isCompact ? 'px-3' : 'px-6';
  const primaryText = isCompact
    ? 'text-role-caption font-semibold uppercase tracking-wider'
    : 'text-sm font-semibold';
  const primaryMinWidth = isCompact ? '' : 'sm:flex-initial sm:min-w-[220px]';
  const primaryRadius = isCompact ? 'rounded-md' : 'rounded-xl';

  const secondaryHeight = isCompact ? 'h-9' : 'h-12';
  const secondaryPadding = isCompact ? 'px-3' : 'px-4';
  const secondaryText = isCompact ? 'text-role-caption font-semibold' : 'text-sm font-semibold';
  const secondaryRadius = isCompact ? 'rounded-md' : 'rounded-xl';

  /** Full-bleed bar; horizontal padding matches typical pane bodies (e.g. `LineEditPanel` `px-4 sm:px-6`). */
  const wrapperPadding = isCompact ? 'py-3' : 'py-3 sm:py-3';
  const innerGutter = isCompact ? 'px-4' : 'px-4 sm:px-6';

  const menu = primary.menu;
  const hasMenu = Array.isArray(menu) && menu.length > 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuListId = useId();

  useEffect(() => {
    if (primary.isLoading) setMenuOpen(false);
  }, [primary.isLoading]);

  const closeMenu = () => setMenuOpen(false);

  const hasLeadingContent = (hints?.length ?? 0) > 0 || leading != null;
  /** One wide CTA only — skips an empty leading flex column eating half the bar. */
  const soloWideCta = primaryFullWidth && !secondary && !hasLeadingContent && !stackLeading;
  const stackLeadingLayout = stackLeading && hasLeadingContent;

  // Floating mode spans the same max-width as the panel body and stretches the
  // CTA full-width — just the button, no bar chrome behind it.
  const stretch = floating || soloWideCta || primaryFullWidth;
  const plainStretch = floating || primaryFullWidth;

  const clusterClass = floating
    ? 'flex w-full min-w-0 items-stretch gap-2'
    : stackLeadingLayout || soloWideCta
      ? 'flex min-w-0 w-full flex-1 flex-row items-stretch gap-2'
      : primaryFullWidth
        ? 'flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:items-stretch sm:justify-end'
        : 'flex flex-1 items-center justify-end gap-2 sm:flex-initial';

  // The primary action cluster (secondary + split/plain CTA). Shared between
  // the full-bleed bar and the floating pill.
  const actionCluster = (
    <div className={clusterClass}>
      {secondary ? (
        <button
          type="button"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          className={`inline-flex ${secondaryHeight} items-center justify-center gap-1.5 ${secondaryRadius} border border-border-soft bg-surface-card ${secondaryPadding} ${secondaryText} text-text-muted shadow-sm transition-colors hover:bg-surface-hover disabled:opacity-40`}
        >
          {secondary.icon}
          <span>{secondary.label}</span>
        </button>
      ) : null}

      {hasMenu ? (
        <div
          className={`relative z-20 flex min-w-0 overflow-visible ${primaryRadius} shadow-sm transition-[filter] duration-100 ${
            primary.disabled ? 'cursor-not-allowed' : 'hover:brightness-[0.96] active:brightness-[0.92]'
          } ${splitTrackBg} ${stretch ? 'w-full min-w-0 flex-1' : 'flex-1 sm:flex-initial'}`}
        >
          <div className="relative flex shrink-0 self-stretch">
            {/* ds-raw-button: split-menu chevron; Popover owns dismissal */}
            <button
              ref={menuTriggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuListId : undefined}
              aria-label={primary.menuLabel ?? 'More actions'}
              title={primary.menuTitle}
              className={`flex ${primaryHeight} items-center justify-center ${primaryRadius.replace('rounded', 'rounded-l')} border-r border-white/20 bg-transparent px-3 text-white outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={primary.isLoading}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((open) => !open);
              }}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 opacity-95 transition-transform duration-150',
                  menuOpen && 'rotate-180',
                )}
              />
            </button>
            <Popover
              open={menuOpen}
              onClose={closeMenu}
              anchorRef={menuTriggerRef}
              placement="top-start"
              gap={6}
              padded={false}
              role="menu"
              id={menuListId}
              aria-label={primary.menuLabel ?? 'More actions'}
              className="min-w-[14rem] py-1 shadow-xl ring-1 ring-border-soft/80"
            >
              {menu!.map((item) => (
                // ds-raw-button: menu item inside Popover role=menu
                <button
                  key={item.label}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    item.onClick();
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-role-caption font-semibold uppercase tracking-wider text-text-default transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </Popover>
          </div>
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled || primary.isLoading}
            title={primary.title}
            className={`inline-flex ${primaryHeight} min-w-0 flex-1 items-center justify-center gap-2 ${primaryRadius.replace('rounded', 'rounded-r')} ${primaryPadding} ${primaryText} bg-transparent text-white outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {primary.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              primary.icon ?? <Check className="h-4 w-4" />
            )}
            <span>{primary.label}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.isLoading}
          title={primary.title}
          className={`inline-flex ${primaryHeight} items-center justify-center gap-2.5 ${primaryRadius} ${primaryPadding} ${primaryText} text-white shadow-sm transition-all ${
            plainStretch ? 'w-full min-w-0 flex-1' : `flex-1 ${primaryMinWidth}`
          } ${toneClass}`}
        >
          {primary.isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{primary.label}</span>
            </>
          ) : (
            <>
              {primary.icon ?? <Check className="h-4 w-4" />}
              <span>{primary.label}</span>
            </>
          )}
        </button>
      )}
    </div>
  );

  // Floating variant — the CTA hovers above the scroll surface, aligned to the panel body's max-width + gutter, with no bar chrome (no…
  if (floating) {
    return (
      <div
        className={`pointer-events-none sticky bottom-0 z-10 pb-4 pt-2 ${
          className ?? ''
        }`}
      >
        <div
          className={`pointer-events-auto mx-auto flex w-full ${maxWidth} flex-col gap-2 ${innerGutter}`}
        >
          {error ? (
            <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-role-caption font-semibold text-red-700">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          ) : null}
          {actionCluster}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`sticky bottom-0 z-10 border-t border-border-soft bg-surface-card/90 ${wrapperPadding} backdrop-blur ${
        className ?? ''
      }`}
    >
      <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-2 ${innerGutter}`}>
        {error ? (
          <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-role-caption font-semibold text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        ) : null}

        <div
          className={`${
            stackLeadingLayout
              ? 'flex w-full min-w-0 flex-col gap-2'
              : soloWideCta
                ? 'flex w-full min-w-0 items-stretch gap-2'
                : primaryFullWidth
                  ? 'flex w-full flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4'
                  : 'flex w-full items-center justify-between gap-4'
          } ${actionRowClassName ?? ''}`}
        >
          {!soloWideCta && hasLeadingContent ? (
            <div
              className={
                stackLeadingLayout
                  ? 'min-w-0 w-full text-xs text-text-soft'
                  : primaryFullWidth
                    ? 'min-w-0 flex flex-wrap items-center gap-3 text-xs text-text-soft sm:flex-1'
                    : 'hidden min-w-0 flex-1 items-center gap-3 text-xs text-text-soft sm:flex'
              }
            >
              {leading ?? (
                <>
                  {hints?.map((h) => (
                    <span
                      key={`${h.key}-${h.label}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <KeyboardKey size="md">{h.key}</KeyboardKey>
                      <span className="font-semibold uppercase tracking-[0.14em]">
                        {h.label}
                      </span>
                    </span>
                  ))}
                </>
              )}
            </div>
          ) : null}

          {actionCluster}
        </div>
      </div>
    </div>
  );
}

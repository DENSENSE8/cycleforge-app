'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  type ComponentType,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SVGProps,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from '@/design-system/motion';
import {
  framerTransition,
  motionBezier,
  scanBandReadyBlinkOpacity,
  scanBandReadySweepY,
} from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { Barcode, Clipboard, ClipboardList, Pencil } from '@/components/Icons';
import { ScanHotkeyControl } from '@/components/scan/ScanHotkeyControl';
import { usePublishCollapseScan } from '@/components/sidebar/context-panel-collapse-context';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import { useRegisterScanTarget } from '@/lib/scan-hotkey/useScanHotkey';
import { zIndex } from '@/design-system/tokens/z-index';
import {
  PRIMARY_CHROME_ROW_FACE,
  SIDEBAR_RAIL_DOT_TRACK,
  SIDEBAR_RAIL_INSET_LEFT,
  SIDEBAR_SCAN_DOCK_LEADING_ROW,
} from '@/components/layout/header-shell';
import type { StationTheme } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';
import { StationScanLeadingIcon } from './StationScanLeadingIcon';
import {
  STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS,
  STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS,
  STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS,
  STATION_SCAN_BAR_DEFAULT_ICON_CLASS,
  STATION_SCAN_BAR_DEFAULT_READY_CURSOR_CLASS,
  STATION_SCAN_BAR_DEFAULT_SUBMIT_TRACE_CLASS,
  STATION_SCAN_BAR_ICON_SLOT_CLASS,
  STATION_SCAN_BAR_INPUT_CLASS,
  STATION_SCAN_BAR_MODE_BTN,
  STATION_SCAN_BAR_MODE_BTN_ARMED,
  STATION_SCAN_BAR_MODE_BTN_COMPACT,
  STATION_SCAN_BAR_MODE_BTN_INACTIVE,
  STATION_SCAN_BAR_MODE_GLYPH_CLASS,
  STATION_SCAN_BAR_PAD_LEFT_CLASS,
  STATION_SCAN_BAR_PAD_LEFT_NONE_ICON_CLASS,
  STATION_SCAN_BAR_RAIL_PAD_FALLBACK_PX,
  STATION_SCAN_BAR_RAIL_PEEK_PX,
  STATION_SCAN_BAR_READY_CURSOR_CLASS,
  STATION_SCAN_BAR_READY_RETICLE_CLASS,
  STATION_SCAN_BAR_READY_SWEEP_CLASS,
  STATION_SCAN_BAR_RIGHT_CELL,
  STATION_SCAN_BAR_RIGHT_FADE_CLASS,
  STATION_SCAN_BAR_RIGHT_SLOT_CLASS,
  STATION_SCAN_BAR_SUBMIT_TRACE_CLASS,
} from './tokens';

type ReadyArmIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Focused-empty ready face — mode icon + short armed identity.
 * Domains pass this instead of `Scan …` placeholder prose.
 */
export interface StationScanReadyArm {
  /** Face copy: `PO # armed` · `Tracking # armed` · `Auto`. */
  label: string;
  Icon: ReadyArmIcon;
  /** Mode hue on the glyph (idle leading icon uses the same tint). */
  tintClassName?: string;
}

export interface StationScanBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  autoFocus?: boolean;
  icon?: ReactNode;
  iconClassName?: string;
  rightContent?: ReactNode;
  className?: string;
  inputClassName?: string;
  rightContentClassName?: string;
  hasRightContent?: boolean;
  /**
   * Bottom-rule chrome classes (e.g. staff theme from
   * {@link STATION_SCAN_BAR_BOTTOM_RULE_CLASS}). Defaults to a soft hairline rule.
   */
  inputBorderClassName?: string;
  /** Staff theme — drives submit center-out trace hue when set. */
  theme?: StationTheme;
  /** Override submit-trace fill (e.g. Scan-out emerald confirm). */
  submitTraceClassName?: string;
  /** Omit left icon slot and use horizontal padding (e.g. labeled fields in FBA sidebar). */
  leadingIcon?: boolean;
  /**
   * Which column the leading icon + typed text align to.
   *   - `masternav` (default) — icon under the MasterNav mode glyph, text under
   *     the MasterNav label (deep inset). For benches with no rail below.
   *   - `rail` — composes {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}: icon in the
   *     status-dot track, typed text on the row title. For scan-dock bars
   *     stacked directly above a recent rail.
   */
  leadingColumn?: 'masternav' | 'rail';
  onInputBlur?: () => void;
  disabled?: boolean;
  /** Show clipboard paste button when input is empty — calls onChange with clipboard text. */
  onPaste?: (text: string) => void;
  /** Optional built-in mode toggle buttons (Plan / Select). */
  showModeButtons?: boolean;
  activeMode?: 'plan' | 'select';
  onPlanMode?: () => void;
  onSelectMode?: () => void;
  /** Which mode buttons to render — defaults to both. Pass a single mode to
   *  pin the bar to one page (Plan-only on the plan page, Select-only on combine). */
  visibleModes?: Array<'plan' | 'select'>;
  /**
   * Wire the shared focus-scan hotkey: registers this bar as the global key's
   * focus target and cross-fades the left icon slot to a gear (reassign
   * dropdown) on hover. Default true — every primary scan bar gets it for free.
   * Set false for secondary/inline fields that shouldn't steal the hotkey.
   * Only renders the gear when `leadingIcon` is true (needs the icon slot).
   */
  hotkey?: boolean;
  /**
   * Focused-empty ready-arm face (icon + `{identity} armed`). Prefer this over
   * `Scan …` placeholder prose. Idle a11y stays on the leading icon / mode rail.
   */
  readyArm?: StationScanReadyArm;
  /**
   * Right-rail content that stays PINNED even while the scan display is active
   * (e.g. a lookup spinner). Unlike {@link StationScanBarProps.rightContent}
   * (the mode rail, which tucks away during the focused scan display), this is
   * never hidden — feedback the operator must not lose mid-scan.
   */
  pinnedRight?: ReactNode;
}

/** Assign a node to both an internal object ref and a forwarded ref of any shape. */
function assignRef<T>(node: T, forwarded: Ref<T> | undefined): void {
  if (!forwarded) return;
  if (typeof forwarded === 'function') forwarded(node);
  else (forwarded as unknown as { current: T | null }).current = node;
}

/**
 * Core scan input — icon slot, hotkey gear, bottom-rule chrome, center-out
 * submit trace, frosted absolute right rail. Prefer {@link ThemedStationScanBar}.
 *
 * The mode rail overlays the trailing edge with a frosted veil so long
 * placeholder / typed text soft-peeks under the glyphs. Clearance is measured
 * from the rail — never magic per-station `pr-*`.
 */
export function StationScanBar({
  value,
  onChange,
  onSubmit,
  inputRef,
  placeholder = 'Tracking, Amazon SKU, Repair, Serial',
  autoFocus = false,
  icon,
  iconClassName = 'text-text-muted',
  rightContent,
  className = '',
  inputClassName = '',
  rightContentClassName = '',
  hasRightContent = true,
  inputBorderClassName,
  theme,
  submitTraceClassName,
  leadingIcon = true,
  leadingColumn = 'masternav',
  onInputBlur,
  disabled = false,
  onPaste,
  showModeButtons = false,
  activeMode = 'plan',
  onPlanMode,
  onSelectMode,
  visibleModes = ['plan', 'select'],
  hotkey = true,
  readyArm,
  pinnedRight,
}: StationScanBarProps) {
  const [scanKey, setScanKey] = useState(0);
  const [railWidthPx, setRailWidthPx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const readyBlinkTransition = useMotionTransition(framerTransition.scanBandReadyBlink);
  const readySweepTransition = useMotionTransition(framerTransition.scanBandReadySweep);
  const readyHudTransition = useMotionTransition(framerTransition.scanBandGlow);

  // Ready-arm bars never paint native placeholder prose (avoids dark "black"
  // placeholder competing with the HUD face).
  const resolvedPlaceholder = readyArm != null ? '' : placeholder;

  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      internalInputRef.current = node;
      assignRef(node, inputRef);
    },
    [inputRef],
  );
  const showHotkeyGear = hotkey && leadingIcon;
  const clearScanValue = useCallback(() => {
    onChange('');
  }, [onChange]);
  // Insert → focus; ⌘. → clear + focus (arm next carton scan on this bar).
  useRegisterScanTarget(internalInputRef, showHotkeyGear, clearScanValue);

  /** Leading glyph click — reclaim focus like Insert (gear button stays clickable). */
  const focusScanInput = useCallback(() => {
    if (disabled) return;
    const el = internalInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [disabled]);

  const handleLeadingPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // Hotkey gear is a real <button> over the glyph on hover — leave it alone.
      if ((event.target as Element | null)?.closest?.('button')) return;
      event.preventDefault();
      focusScanInput();
    },
    [focusScanInput],
  );

  const handleInternalSubmit = useCallback((e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    setScanKey((prev) => prev + 1);
    onSubmit(e);
  }, [onSubmit]);

  const bottomRule = inputBorderClassName ?? STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS;
  const collapseHover =
    theme != null
      ? STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS[theme]
      : STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS;
  const collapseTheme = theme ?? 'green';

  // Primary hotkey bars publish into the parked strip so operators can arm a
  // new scan without expanding. Secondary fields (`hotkey={false}`) stay quiet.
  usePublishCollapseScan(
    showHotkeyGear
      ? {
          value,
          onChange,
          onSubmit: () => handleInternalSubmit(),
          placeholder: resolvedPlaceholder,
          bottomRuleClass: bottomRule,
          hoverClass: collapseHover,
          theme: collapseTheme,
        }
      : null,
  );

  const handlePasteClick = useCallback(async () => {
    if (!onPaste) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onPaste(text.trim());
    } catch { /* clipboard blocked */ }
  }, [onPaste]);

  const showPaste = !!onPaste;
  const modeButtonCount = showModeButtons ? visibleModes.length : 0;
  const hasActiveRightContent = hasRightContent && rightContent != null;
  const hasPinnedRight = pinnedRight != null;
  const showRight =
    hasActiveRightContent || showPaste || modeButtonCount > 0 || hasPinnedRight;

  // Measure the frosted rail so padding-inline-end tracks real glyph width
  // (3 compact modes ≠ 1 spinner ≠ paste reveal) — never a magic pr-32 twin.
  useLayoutEffect(() => {
    if (!showRight) {
      setRailWidthPx(0);
      return;
    }
    const el = railRef.current;
    if (!el) return;
    const measure = () => {
      setRailWidthPx(Math.ceil(el.getBoundingClientRect().width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showRight, modeButtonCount, hasActiveRightContent, showPaste, rightContent, pinnedRight]);

  // `rail` = structural share of SIDEBAR_SCAN_DOCK_LEADING_ROW (icon in the
  // status-dot track, text on the row title); `masternav` = deep inset under
  // the MasterNav label/glyph.
  const dense = leadingColumn === 'rail';
  const padLeft = dense
    ? 'pl-0'
    : leadingIcon
      ? STATION_SCAN_BAR_PAD_LEFT_CLASS
      : STATION_SCAN_BAR_PAD_LEFT_NONE_ICON_CLASS;
  const modeBtnShell = modeButtonCount >= 2 ? STATION_SCAN_BAR_MODE_BTN_COMPACT : STATION_SCAN_BAR_MODE_BTN;

  // Peek under the frost so typed text soft-reads past the first glyph;
  // caret stays mostly clear of the icons.
  const padEndPx = showRight
    ? Math.max(
        8,
        (railWidthPx > 0 ? railWidthPx : STATION_SCAN_BAR_RAIL_PAD_FALLBACK_PX) -
          STATION_SCAN_BAR_RAIL_PEEK_PX,
      )
    : 16;
  const inputPadStyle: CSSProperties = { paddingInlineEnd: padEndPx };

  // The ready HUD's frame (reticle + sweep) spans the FULL bar over the frosted
  // mode rail; only the armed-identity TEXT stops at the rail's left edge so the
  // label never collides with the mode glyphs.
  const readyFaceRightPx = showRight
    ? railWidthPx > 0
      ? railWidthPx
      : STATION_SCAN_BAR_RAIL_PAD_FALLBACK_PX
    : 12;

  const traceClass =
    submitTraceClassName
    ?? (theme ? STATION_SCAN_BAR_SUBMIT_TRACE_CLASS[theme] : STATION_SCAN_BAR_DEFAULT_SUBMIT_TRACE_CLASS);
  const readyCursorClass =
    theme != null
      ? STATION_SCAN_BAR_READY_CURSOR_CLASS[theme]
      : STATION_SCAN_BAR_DEFAULT_READY_CURSOR_CLASS;
  const readyReticleClass =
    theme != null ? STATION_SCAN_BAR_READY_RETICLE_CLASS[theme] : 'border-blue-500/35';
  const readySweepClass =
    theme != null ? STATION_SCAN_BAR_READY_SWEEP_CLASS[theme] : 'bg-blue-400/35';
  // Focused → clear placeholder + leading icon so the ready HUD is the only
  // peripheral cue. Empty + focused → ready-arm face (icon + label) + block caret.
  const showReadyHud = inputFocused && !disabled;
  const showReadyCursor = showReadyHud && value.length === 0;
  const ReadyArmIcon = readyArm?.Icon;

  const leadingInner = (() => {
    const fallback = <Barcode className={STATION_SCAN_BAR_DEFAULT_ICON_CLASS} />;
    const raw = icon ?? fallback;
    // Mode-rail bars pass StationScanLeadingIcon — inject focus reclaim.
    if (isValidElement(raw) && raw.type === StationScanLeadingIcon) {
      return cloneElement(
        raw as ReactElement<{ onActivate?: () => void }>,
        { onActivate: focusScanInput },
      );
    }
    return raw;
  })();

  const leadingGlyph = showHotkeyGear ? (
    <ScanHotkeyControl>{leadingInner}</ScanHotkeyControl>
  ) : (
    leadingInner
  );

  const readyCaretEl = (
    <motion.div
      initial={false}
      animate={
        shouldReduceMotion
          ? { opacity: 0.75 }
          : { opacity: [...scanBandReadyBlinkOpacity] }
      }
      transition={shouldReduceMotion ? { duration: 0 } : readyBlinkTransition}
      className={cn('h-3 w-px shrink-0', readyCursorClass)}
    />
  );

  const readyHudEl = showReadyHud ? (
    <motion.div
      key="ready-hud"
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={readyHudTransition}
      // Above the frosted mode rail (z-dropdown) so the scan display reads
      // full-width — never clipped by / hidden under the mode glyphs. Stays
      // pointer-events-none so arming a mode still clicks through.
      style={{ zIndex: zIndex.dropdown + 1 }}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className={cn(
          'absolute left-0 top-0 h-2 w-2 border-l border-t',
          readyReticleClass,
        )}
      />
      <div
        className={cn(
          'absolute right-0 top-0 h-2 w-2 border-r border-t',
          readyReticleClass,
        )}
      />
      <div
        className={cn(
          'absolute bottom-0 left-0 h-2 w-2 border-b border-l',
          readyReticleClass,
        )}
      />
      <div
        className={cn(
          'absolute bottom-0 right-0 h-2 w-2 border-b border-r',
          readyReticleClass,
        )}
      />
      {!shouldReduceMotion ? (
        <motion.div
          animate={{ y: [...scanBandReadySweepY] }}
          transition={readySweepTransition}
          className={cn('absolute left-0 right-0 top-0 h-px', readySweepClass)}
        />
      ) : null}
      {showReadyCursor ? (
        readyArm && ReadyArmIcon ? (
          <div
            className="absolute inset-y-0 left-3 flex items-center gap-1.5"
            style={{ right: readyFaceRightPx }}
          >
            <ReadyArmIcon
              className={cn(
                STATION_SCAN_BAR_DEFAULT_ICON_CLASS,
                'shrink-0',
                readyArm.tintClassName ?? 'text-text-faint',
              )}
            />
            <span className="truncate text-role-caption font-semibold text-text-faint">
              {readyArm.label}
            </span>
            {readyCaretEl}
          </div>
        ) : (
          <div className="absolute inset-y-0 left-3 flex items-center">{readyCaretEl}</div>
        )
      ) : null}
    </motion.div>
  ) : null;

  const inputEl = (
    <input
      ref={setInputRef}
      type="text"
      // Stable hook for the focus-lock assertions (§3 of display/station.md):
      // the bar is the scan hotkey's target, and a spec must be able to say
      // "focus came back HERE" without matching on a per-station placeholder.
      data-station-scan-input={showHotkeyGear ? '' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setInputFocused(true)}
      onBlur={() => {
        setInputFocused(false);
        onInputBlur?.();
      }}
      // Never paint native placeholder when readyArm owns the empty face;
      // also clear while focused so HUD is the only cue.
      placeholder={showReadyHud || readyArm != null ? '' : resolvedPlaceholder}
      autoFocus={autoFocus}
      disabled={disabled}
      style={inputPadStyle}
      className={cn(
        STATION_SCAN_BAR_INPUT_CLASS,
        // Full-bleed under the frosted rail; border lives on the outer shell.
        'relative z-base min-w-0 flex-1 border-0',
        // Focused: collapse leading icon pad so the clear field matches every skin.
        showReadyHud ? 'pl-3' : padLeft,
        showReadyCursor && 'caret-transparent',
        // Hotkey gear cross-fades in the fixed icon slot — never bump pl on hover.
        inputClassName,
      )}
    />
  );

  const showModeGroup = modeButtonCount > 0 || hasActiveRightContent || showPaste;

  const rightRail = showRight ? (
    <div
      ref={railRef}
      className={cn(
        STATION_SCAN_BAR_RIGHT_SLOT_CLASS,
        // Scan display is active (focused): drop the frosted veil so the
        // full-width scan display reads clean; the veil + mode glyphs reveal on
        // hover. The pinned status cell (spinner) stays visible either way.
        // Never `focus-within` here — an auto-focused bench would never hide.
        showReadyHud &&
          'bg-transparent backdrop-blur-none group-hover:bg-surface-card/70 group-hover:backdrop-blur-sm',
        rightContentClassName,
      )}
    >
      {/* Mode / control group — tucks away during the scan display, reveals on
          hover so arming stays one click. mousedown keeps the scan input
          focused: a mode/paste click must NEVER steal focus off the wedge
          (the "focus on arm" fix — central, so every station bar inherits it).
          Stays measured (opacity-0, still laid out) so the input pad holds. */}
      {showModeGroup ? (
        <div
          onMouseDown={(event) => {
            event.preventDefault();
            focusScanInput();
          }}
          className={cn(
            'relative flex h-full items-stretch gap-0',
            showReadyHud &&
              'opacity-0 pointer-events-none transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100',
          )}
        >
          <span className={STATION_SCAN_BAR_RIGHT_FADE_CLASS} aria-hidden />
          {modeButtonCount > 0 ? (
            <div className="flex h-full shrink-0 items-stretch gap-0" role="group" aria-label="Scan mode">
              {visibleModes.includes('plan') ? (
                <HoverTooltip label="Plan mode" asChild>
                  <button
                    type="button"
                    onClick={onPlanMode}
                    aria-pressed={activeMode === 'plan'}
                    aria-label={activeMode === 'plan' ? 'Plan mode active' : 'Switch to plan mode'}
                    className={cn(
                      'ds-raw-button',
                      modeBtnShell,
                      activeMode === 'plan'
                        ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, 'text-purple-700')
                        : STATION_SCAN_BAR_MODE_BTN_INACTIVE,
                    )}
                  >
                    <ClipboardList className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />
                  </button>
                </HoverTooltip>
              ) : null}
              {visibleModes.includes('select') ? (
                <HoverTooltip label="Select mode" asChild>
                  <button
                    type="button"
                    onClick={onSelectMode}
                    aria-pressed={activeMode === 'select'}
                    aria-label={activeMode === 'select' ? 'Select mode active' : 'Switch to select mode'}
                    className={cn(
                      'ds-raw-button',
                      modeBtnShell,
                      activeMode === 'select'
                        ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, 'text-blue-700')
                        : STATION_SCAN_BAR_MODE_BTN_INACTIVE,
                    )}
                  >
                    <Pencil className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />
                  </button>
                </HoverTooltip>
              ) : null}
            </div>
          ) : null}
          {hasActiveRightContent ? (
            <div className="flex h-full shrink-0 items-stretch">{rightContent}</div>
          ) : null}
          {showPaste ? (
            <IconButton
              onClick={() => void handlePasteClick()}
              className={cn(
                'ds-allow-control-size rounded-none',
                STATION_SCAN_BAR_RIGHT_CELL,
                STATION_SCAN_BAR_MODE_BTN_INACTIVE,
                // Secondary affordance — quiet at rest; reveal only on THIS
                // scan bar hover/focus, never the whole rail.
                'pointer-events-none opacity-0 transition-opacity duration-100',
                'group-hover:pointer-events-auto group-hover:opacity-100',
                'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                'focus-visible:pointer-events-auto focus-visible:opacity-100',
              )}
              title="Paste from clipboard"
              ariaLabel="Paste from clipboard"
              icon={<Clipboard className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />}
            />
          ) : null}
        </div>
      ) : null}
      {/* Pinned status (spinner) — never hidden; stays over the clean scan
          display so "lookup in flight" feedback survives the tuck-away. */}
      {hasPinnedRight ? (
        <div className="relative z-raised flex h-full shrink-0 items-stretch">{pinnedRight}</div>
      ) : null}
    </div>
  ) : null;

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: motionBezier.easeOut }}
      onSubmit={handleInternalSubmit}
      className={cn('group relative', className)}
    >
      <div
        className={cn(
          'relative isolate flex w-full items-stretch',
          PRIMARY_CHROME_ROW_FACE,
          bottomRule,
          // Focus brightens the shell rule (input is border-0).
          theme ? `focus-within:border-b-${theme}-600` : null,
        )}
      >
        {dense ? (
          <div className={cn(SIDEBAR_RAIL_INSET_LEFT, 'relative flex min-w-0 flex-1 items-stretch')}>
            <AnimatePresence initial={false}>{readyHudEl}</AnimatePresence>
            <div className={cn(SIDEBAR_SCAN_DOCK_LEADING_ROW, 'relative h-full min-w-0 w-full')}>
              {/* Focused ready HUD clears the leading glyph — collapse the track
                  so the field width matches every station skin. */}
              {leadingIcon && !showReadyHud ? (
                <span
                  className={cn(
                    SIDEBAR_RAIL_DOT_TRACK,
                    'relative z-raised flex shrink-0 items-center justify-center',
                    iconClassName,
                  )}
                  onPointerDown={handleLeadingPointerDown}
                >
                  {leadingGlyph}
                </span>
              ) : !leadingIcon ? (
                <span className={cn(SIDEBAR_RAIL_DOT_TRACK, 'shrink-0')} aria-hidden />
              ) : null}
              <div className="relative min-w-0 flex-1">{inputEl}</div>
            </div>
          </div>
        ) : (
          <div className="relative min-w-0 flex-1">
            <AnimatePresence initial={false}>{readyHudEl}</AnimatePresence>
            {leadingIcon ? (
              <div
                className={cn(
                  STATION_SCAN_BAR_ICON_SLOT_CLASS,
                  'transition-opacity duration-100',
                  showReadyHud && 'pointer-events-none opacity-0',
                  iconClassName,
                )}
                onPointerDown={handleLeadingPointerDown}
              >
                {leadingGlyph}
              </div>
            ) : null}
            {inputEl}
          </div>
        )}

        {rightRail}

        {/* Center→edges submit confirm on the bottom rule (same hue family). */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-raised h-0.5 overflow-hidden"
          aria-hidden
        >
          <AnimatePresence>
            {scanKey > 0 ? (
              <motion.div
                key={scanKey}
                initial={shouldReduceMotion ? { opacity: 0 } : { scaleX: 0, opacity: 0.35 }}
                animate={
                  shouldReduceMotion
                    ? { opacity: [0, 1, 0] }
                    : { scaleX: [0, 1], opacity: [0.35, 1, 0] }
                }
                exit={{ opacity: 0 }}
                transition={{
                  duration: shouldReduceMotion ? 0.15 : 0.26,
                  ease: motionBezier.easeOut,
                  times: shouldReduceMotion ? undefined : [0, 0.55, 1],
                }}
                className={cn('absolute inset-y-0 left-0 w-full origin-center', traceClass)}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.form>
  );
}

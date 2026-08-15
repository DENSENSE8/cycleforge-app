'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { Clipboard, ClipboardList, Pencil } from '@/components/Icons';
import { ScanHotkeyControl } from '@/components/scan/ScanHotkeyControl';
import { usePublishCollapseScan } from '@/components/sidebar/context-panel-collapse-context';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import { useRegisterScanTarget } from '@/lib/scan-hotkey/useScanHotkey';
import {
  PRIMARY_CHROME_ROW_FACE,
  SIDEBAR_RAIL_DOT_TRACK,
  SIDEBAR_RAIL_INSET_LEFT,
  SIDEBAR_SCAN_DOCK_LEADING_ROW,
} from '@/components/layout/header-shell';
import type { StationTheme } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';
import { StationScanLeadingIcon } from './StationScanLeadingIcon';
import { StationScanPreviewCard } from './StationScanPreviewCard';
import {
  type StationScanPreviewClassification,
} from './preview-classify';
import { setScanEscBlock } from './scan-esc-block';
import { getScanStance, setScanStance, useScanStance, useToggleScanStance } from './scan-stance';
import {
  STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS,
  STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS,
  STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS,
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
  STATION_SCAN_BAR_RIGHT_CELL,
  STATION_SCAN_BAR_RIGHT_FADE_CLASS,
  STATION_SCAN_BAR_RIGHT_SLOT_CLASS,
  STATION_SCAN_BAR_SUBMIT_TRACE_CLASS,
} from './tokens';

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
   * After a preview decode or a committed scan value, show a read-only face
   * (click → select-all edit). Default on for station bars; off when
   * `hotkey={false}` or Plan/Select mode buttons are showing.
   */
  displayEdit?: boolean;
  /**
   * Preview stance: classify the submitted value locally (no network write).
   * Hosts pass classifyUnboxScan / classifyTestingScan / getStationInputMode.
   */
  classifyPreview?: (value: string) => StationScanPreviewClassification | null;
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
  displayEdit: displayEditProp,
  classifyPreview,
}: StationScanBarProps) {
  const [scanKey, setScanKey] = useState(0);
  const [railWidthPx, setRailWidthPx] = useState(0);
  const [previewResult, setPreviewResult] = useState<StationScanPreviewClassification | null>(null);
  const [face, setFace] = useState<'edit' | 'display'>('edit');
  const [committedValue, setCommittedValue] = useState('');
  const stance = useScanStance();
  const toggleStance = useToggleScanStance();
  const shouldReduceMotion = useReducedMotion();
  const displayEdit = displayEditProp ?? (hotkey && !showModeButtons);

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
    setPreviewResult(null);
    setCommittedValue('');
    setFace('edit');
  }, [onChange]);
  // Insert → focus; ⌘. → clear + focus (arm next carton scan on this bar).
  useRegisterScanTarget(internalInputRef, showHotkeyGear, clearScanValue);

  const enterEdit = useCallback(() => {
    setFace('edit');
    requestAnimationFrame(() => {
      const el = internalInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, []);

  const showDisplayFace = displayEdit && face === 'display' && value.trim() !== '';

  const handleInternalSubmit = useCallback((e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (getScanStance() === 'preview') {
      const classified =
        classifyPreview?.(trimmed) ??
        (trimmed
          ? { typeLabel: 'Value', value: trimmed, source: 'auto' as const }
          : null);
      setPreviewResult(classified);
      if (classified && displayEdit) {
        setCommittedValue(classified.value);
        setFace('display');
      }
      return;
    }
    setPreviewResult(null);
    setScanKey((prev) => prev + 1);
    if (trimmed && displayEdit) {
      setCommittedValue(trimmed);
      setFace('display');
    }
    onSubmit(e);
  }, [onSubmit, value, classifyPreview, displayEdit]);

  const dismissPreview = useCallback(() => {
    setPreviewResult(null);
  }, []);

  const promoteToScan = useCallback(() => {
    setPreviewResult(null);
    setScanStance('scan');
    setScanKey((prev) => prev + 1);
    if (value.trim() && displayEdit) {
      setCommittedValue(value.trim());
      setFace('display');
    }
    onSubmit();
  }, [onSubmit, value, displayEdit]);

  useEffect(() => {
    if (previewResult) {
      setScanEscBlock('preview-card', () => setPreviewResult(null));
      return () => {
        setScanEscBlock('none');
      };
    }
    if (
      displayEdit &&
      face === 'edit' &&
      committedValue !== '' &&
      value === committedValue
    ) {
      setScanEscBlock('display-edit', () => setFace('display'));
      return () => {
        setScanEscBlock('none');
      };
    }
    setScanEscBlock('none');
    return undefined;
  }, [previewResult, displayEdit, face, committedValue, value]);

  useEffect(() => {
    if (!value.trim()) {
      setFace('edit');
      setCommittedValue('');
      setPreviewResult(null);
    }
  }, [value]);

  // Display face is showing — a new HID wedge must not drop. Claim the
  // cancelable `wedge-scan` and fill + focus (Enter then commits).
  useEffect(() => {
    if (!showDisplayFace) return;
    const onWedge = (event: Event) => {
      const raw = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (!raw?.trim()) return;
      event.preventDefault();
      onChange(raw.trim());
      setCommittedValue('');
      setFace('edit');
      requestAnimationFrame(() => {
        const el = internalInputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      });
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [showDisplayFace, onChange]);

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
          placeholder,
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
  const showRight = hasActiveRightContent || showPaste || modeButtonCount > 0;

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
  }, [showRight, modeButtonCount, hasActiveRightContent, showPaste, rightContent]);

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

  // Peek under the frost so "Purchase order" soft-reads past the first glyph;
  // caret stays mostly clear of the icons.
  const padEndPx = showRight
    ? Math.max(
        8,
        (railWidthPx > 0 ? railWidthPx : STATION_SCAN_BAR_RAIL_PAD_FALLBACK_PX) -
          STATION_SCAN_BAR_RAIL_PEEK_PX,
      )
    : 16;
  const inputPadStyle: CSSProperties = { paddingInlineEnd: padEndPx };

  const traceClass =
    submitTraceClassName
    ?? (theme ? STATION_SCAN_BAR_SUBMIT_TRACE_CLASS[theme] : STATION_SCAN_BAR_DEFAULT_SUBMIT_TRACE_CLASS);

  const stanceGlyph = (
    <StationScanLeadingIcon stance={stance} onToggle={toggleStance} scanIcon={icon} />
  );
  const leadingGlyph = showHotkeyGear ? (
    <ScanHotkeyControl>{stanceGlyph}</ScanHotkeyControl>
  ) : (
    stanceGlyph
  );

  const inputEl = (
    <input
      ref={setInputRef}
      type="text"
      // Stable hook for the focus-lock assertions (§3 of display/station.md):
      // the bar is the scan hotkey's target, and a spec must be able to say
      // "focus came back HERE" without matching on a per-station placeholder.
      data-station-scan-input={showHotkeyGear && !showDisplayFace ? '' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onInputBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      style={inputPadStyle}
      className={cn(
        STATION_SCAN_BAR_INPUT_CLASS,
        // Full-bleed under the frosted rail; border lives on the outer shell.
        'relative z-base min-w-0 flex-1 border-0',
        padLeft,
        // Hotkey gear cross-fades in the fixed icon slot — never bump pl on hover.
        inputClassName,
        showDisplayFace ? 'sr-only' : null,
      )}
      aria-hidden={showDisplayFace || undefined}
      tabIndex={showDisplayFace ? -1 : undefined}
    />
  );

  const displayFaceEl = showDisplayFace ? (
    <button
      type="button"
      data-station-scan-input=""
      data-station-scan-display=""
      onClick={enterEdit}
      title="Click to edit"
      style={inputPadStyle}
      className={cn(
        STATION_SCAN_BAR_INPUT_CLASS,
        'relative z-base min-w-0 flex-1 border-0 text-left',
        padLeft,
        inputClassName,
      )}
    >
      <span className="block truncate">{value}</span>
      <span className="sr-only">Click to edit</span>
    </button>
  ) : null;

  const rightRail = showRight ? (
    <div
      ref={railRef}
      className={cn(STATION_SCAN_BAR_RIGHT_SLOT_CLASS, rightContentClassName)}
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
  ) : null;

  const fieldRow = (
    <>
      {dense ? (
        <div className={cn(SIDEBAR_RAIL_INSET_LEFT, 'flex min-w-0 flex-1 items-stretch')}>
          <div className={cn(SIDEBAR_SCAN_DOCK_LEADING_ROW, 'h-full min-w-0 w-full')}>
            {leadingIcon ? (
              <span
                className={cn(
                  SIDEBAR_RAIL_DOT_TRACK,
                  'relative z-raised flex shrink-0 items-center justify-center',
                  iconClassName,
                )}
              >
                {leadingGlyph}
              </span>
            ) : (
              <span className={cn(SIDEBAR_RAIL_DOT_TRACK, 'shrink-0')} aria-hidden />
            )}
            {displayFaceEl}
            {inputEl}
          </div>
        </div>
      ) : (
        <div className="relative min-w-0 flex-1">
          {leadingIcon ? (
            <div className={cn(STATION_SCAN_BAR_ICON_SLOT_CLASS, iconClassName)}>
              {leadingGlyph}
            </div>
          ) : null}
          {displayFaceEl}
          {inputEl}
        </div>
      )}
    </>
  );

  return (
    <div className={cn('group relative', className)}>
      <motion.form
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: motionBezier.easeOut }}
        onSubmit={handleInternalSubmit}
        className="relative"
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
          {fieldRow}

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
      {previewResult ? (
        <StationScanPreviewCard
          result={previewResult}
          onScanIt={promoteToScan}
          onDismiss={dismissPreview}
        />
      ) : null}
    </div>
  );
}


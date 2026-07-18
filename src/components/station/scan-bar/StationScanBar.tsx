'use client';

import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { Barcode, Clipboard, ClipboardList, Pencil } from '@/components/Icons';
import { ScanHotkeyControl } from '@/components/scan/ScanHotkeyControl';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import { useRegisterScanTarget } from '@/lib/scan-hotkey/useScanHotkey';
import type { StationTheme } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';
import {
  STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS,
  STATION_SCAN_BAR_DEFAULT_ICON_CLASS,
  STATION_SCAN_BAR_DEFAULT_SUBMIT_TRACE_CLASS,
  STATION_SCAN_BAR_FLOAT_RAIL_CLASS,
  STATION_SCAN_BAR_ICON_SLOT_CLASS,
  STATION_SCAN_BAR_INPUT_CLASS,
  STATION_SCAN_BAR_MODE_BTN,
  STATION_SCAN_BAR_MODE_BTN_ARMED,
  STATION_SCAN_BAR_MODE_BTN_COMPACT,
  STATION_SCAN_BAR_MODE_BTN_INACTIVE,
  STATION_SCAN_BAR_PAD_LEFT_CLASS,
  STATION_SCAN_BAR_PAD_LEFT_NONE_ICON_CLASS,
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
   * focus target and reveals the gear (reassign) affordance in the left icon
   * slot on hover. Default true — every primary scan bar gets it for free.
   * Set false for secondary/inline fields that shouldn't steal the hotkey.
   * Only renders the gear when `leadingIcon` is true (needs the icon slot).
   */
  hotkey?: boolean;
}

/** Assign a node to both an internal object ref and a forwarded ref of any shape. */
function assignRef<T>(node: T, forwarded: Ref<T> | undefined): void {
  if (!forwarded) return;
  if (typeof forwarded === 'function') forwarded(node);
  else (forwarded as unknown as { current: T | null }).current = node;
}

/**
 * Core scan input — icon slot, hotkey gear, bottom-rule chrome, center-out
 * submit trace, optional right rail. Prefer {@link ThemedStationScanBar}.
 */
export function StationScanBar({
  value,
  onChange,
  onSubmit,
  inputRef,
  placeholder = 'Tracking, FNSKU, RS ID, SN',
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
  onInputBlur,
  disabled = false,
  onPaste,
  showModeButtons = false,
  activeMode = 'plan',
  onPlanMode,
  onSelectMode,
  visibleModes = ['plan', 'select'],
  hotkey = true,
}: StationScanBarProps) {
  const [scanKey, setScanKey] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      internalInputRef.current = node;
      assignRef(node, inputRef);
    },
    [inputRef],
  );
  const showHotkeyGear = hotkey && leadingIcon;
  useRegisterScanTarget(internalInputRef, showHotkeyGear);

  const handleInternalSubmit = useCallback((e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    setScanKey((prev) => prev + 1);
    onSubmit(e);
  }, [onSubmit]);

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
  const rightChipCount =
    modeButtonCount + (showPaste ? 1 : 0) + (hasActiveRightContent ? 1 : 0);

  const padLeft = leadingIcon ? STATION_SCAN_BAR_PAD_LEFT_CLASS : STATION_SCAN_BAR_PAD_LEFT_NONE_ICON_CLASS;
  const padRight = !showRight
    ? 'pr-4'
    : rightChipCount >= 3
      ? 'pr-44'
      : rightChipCount >= 2
        ? 'pr-36'
        : 'pr-24';
  const modeBtnShell = modeButtonCount >= 2 ? STATION_SCAN_BAR_MODE_BTN_COMPACT : STATION_SCAN_BAR_MODE_BTN;

  const traceClass =
    submitTraceClassName
    ?? (theme ? STATION_SCAN_BAR_SUBMIT_TRACE_CLASS[theme] : STATION_SCAN_BAR_DEFAULT_SUBMIT_TRACE_CLASS);

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: motionBezier.easeOut }}
      onSubmit={handleInternalSubmit}
      className={cn('group relative', className)}
    >
      <div className="relative isolate">
        {leadingIcon ? (
          <div className={cn(STATION_SCAN_BAR_ICON_SLOT_CLASS, iconClassName)}>
            {showHotkeyGear ? (
              <ScanHotkeyControl>{icon ?? <Barcode className={STATION_SCAN_BAR_DEFAULT_ICON_CLASS} />}</ScanHotkeyControl>
            ) : (
              icon ?? <Barcode className={STATION_SCAN_BAR_DEFAULT_ICON_CLASS} />
            )}
          </div>
        ) : null}
        <input
          ref={setInputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onInputBlur}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={cn(
            STATION_SCAN_BAR_INPUT_CLASS,
            'relative z-base',
            padLeft,
            padRight,
            showHotkeyGear ? 'group-hover:pl-16' : '',
            inputBorderClassName ?? STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS,
            inputClassName,
          )}
        />

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

        {showRight ? (
          <div
            className={cn(
              STATION_SCAN_BAR_RIGHT_SLOT_CLASS,
              STATION_SCAN_BAR_FLOAT_RAIL_CLASS,
              rightContentClassName,
            )}
          >
            {modeButtonCount > 0 ? (
              <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Scan mode">
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
                          ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, 'bg-purple-500/10 text-purple-700')
                          : STATION_SCAN_BAR_MODE_BTN_INACTIVE,
                      )}
                    >
                      <ClipboardList className="h-3.5 w-3.5 shrink-0" />
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
                          ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, 'bg-blue-500/10 text-blue-700')
                          : STATION_SCAN_BAR_MODE_BTN_INACTIVE,
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  </HoverTooltip>
                ) : null}
              </div>
            ) : null}
            {hasActiveRightContent ? (
              <div className="flex shrink-0 items-center">{rightContent}</div>
            ) : null}
            {showPaste ? (
              <IconButton
                onClick={() => void handlePasteClick()}
                className={cn(
                  STATION_SCAN_BAR_MODE_BTN_COMPACT,
                  STATION_SCAN_BAR_MODE_BTN_INACTIVE,
                  'shrink-0',
                )}
                title="Paste from clipboard"
                ariaLabel="Paste from clipboard"
                icon={<Clipboard className="h-3.5 w-3.5 shrink-0" />}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.form>
  );
}

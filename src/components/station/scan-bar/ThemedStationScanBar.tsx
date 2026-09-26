'use client';

import { Loader2 } from '@/components/Icons';
import { useStationTheme } from '@/hooks/useStationTheme';
import { cn } from '@/utils/_cn';
import { StationScanBar, type StationScanBarProps } from './StationScanBar';
import {
  STATION_SCAN_BAR_MODE_GLYPH_CLASS,
  STATION_SCAN_BAR_RIGHT_CELL,
  stationScanBarFocusInputClass,
} from './tokens';

export interface ThemedStationScanBarProps extends Omit<StationScanBarProps, 'inputBorderClassName' | 'theme'> {
  /** Staff id — resolves theme-colored bottom rule + focus + submit trace. */
  staffId?: string | number | null;
  /** Override the themed bottom rule when a surface needs a one-off stroke. */
  inputBorderClassName?: string;
  /** Override submit-trace fill (e.g. Scan-out emerald confirm). */
  submitTraceClassName?: string;
  /** Show a spinner in the right rail (lookup in flight). */
  isResolving?: boolean;
}

/** Master scan-bar shell: */
export function ThemedStationScanBar({
  staffId,
  inputBorderClassName,
  inputClassName,
  rightContent,
  isResolving = false,
  submitTraceClassName,
  ...props
}: ThemedStationScanBarProps) {
  const { theme, inputBorder } = useStationTheme({
    staffId: staffId != null ? Number(staffId) : 0,
  });

  const resolvedRight =
    isResolving || rightContent != null ? (
      <>
        {isResolving ? (
          <span className={STATION_SCAN_BAR_RIGHT_CELL} aria-hidden>
            <Loader2 className={cn(STATION_SCAN_BAR_MODE_GLYPH_CLASS, 'animate-spin text-text-muted')} />
          </span>
        ) : null}
        {rightContent}
      </>
    ) : null;

  return (
    <StationScanBar
      {...props}
      theme={theme}
      submitTraceClassName={submitTraceClassName}
      inputBorderClassName={inputBorderClassName ?? inputBorder}
      inputClassName={cn(stationScanBarFocusInputClass(theme), inputClassName)}
      rightContent={resolvedRight}
      hasRightContent={props.hasRightContent ?? Boolean(resolvedRight)}
    />
  );
}

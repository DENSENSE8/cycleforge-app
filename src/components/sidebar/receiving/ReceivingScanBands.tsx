'use client';

/**
 * Scan-band presentational components for the receiving sidebar.
 *
 * `ScanBandShell` is the shared animated container (Framer glow host + fade-in
 * entrance). `TriageScanBand` is the tracking-only entry used by the Receiving
 * (triage) surface; `UnboxScanBand` is the mode-toggling entry used by Unbox.
 * Both are thin: they own no scan logic — submit/value are handed down from the
 * panel's scan hook. Extracted from ReceivingSidebarPanel.
 */

import { motion } from 'framer-motion';
import { cn } from '@/utils/_cn';
import { receivingScanBandClass } from '@/components/layout/header-shell';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import { ThemedStationScanBar } from '@/components/station/scan-bar';
import {
  ReceivingUnboxScanBar,
  type UnboxScanMode,
} from '@/components/sidebar/receiving/ReceivingUnboxScanBar';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import type { StationTheme } from '@/hooks/useStationTheme';

interface ScanBandShellProps {
  themeColor: StationTheme;
  children: React.ReactNode;
}

/**
 * Animated, staff-tinted container for a scan bar. Full-bleed flat chrome
 * (depth 2 — no card shadow). Framer glow ramps on focus/click and pulses on
 * submit; work canvas owns the elevated plane via border only.
 * Mode segments inside the bar own the solid card plane when armed.
 * Opacity-only entrance so the band is not clipped by sidebar overflow.
 */
export function ScanBandShell({ themeColor, children }: ScanBandShellProps) {
  const mountTransition = useMotionTransition(framerTransition.scanBandGlow);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={mountTransition}
    >
      <ScanBandGlowHost themeColor={themeColor} className={cn(receivingScanBandClass)}>
        {children}
      </ScanBandGlowHost>
    </motion.div>
  );
}

interface TriageScanBandProps {
  themeColor: StationTheme;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  inputRef: React.Ref<HTMLInputElement>;
  staffId?: string | number | null;
  isResolving: boolean;
}

/**
 * Tracking-only scan entry for the Receiving (triage) surface — no
 * Tracking#/PO# mode toggle. The input doubles as the live rail filter; submit
 * runs the same lookup-po flow as Unbox.
 */
export function TriageScanBand({
  themeColor,
  value,
  onChange,
  onSubmit,
  inputRef,
  staffId,
  isResolving,
}: TriageScanBandProps) {
  return (
    <ScanBandShell themeColor={themeColor}>
      <ThemedStationScanBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
        staffId={staffId}
        placeholder="Scan tracking #"
        autoFocus
        className="w-full"
        isResolving={isResolving}
      />
    </ScanBandShell>
  );
}

interface UnboxScanBandProps {
  themeColor: StationTheme;
  value: string;
  onChange: (next: string) => void;
  onSubmit: (mode: UnboxScanMode | 'auto') => void;
  inputRef: React.Ref<HTMLInputElement>;
  isResolving: boolean;
  staffId: string;
  armedMode: UnboxScanMode | null;
  onToggleMode: (mode: UnboxScanMode) => void;
}

/** Mode-toggling scan entry for the Unbox workspace. */
export function UnboxScanBand({
  themeColor,
  value,
  onChange,
  onSubmit,
  inputRef,
  isResolving,
  staffId,
  armedMode,
  onToggleMode,
}: UnboxScanBandProps) {
  return (
    <ScanBandShell themeColor={themeColor}>
      <ReceivingUnboxScanBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
        isResolving={isResolving}
        staffId={staffId}
        armedMode={armedMode}
        onToggleMode={onToggleMode}
      />
    </ScanBandShell>
  );
}

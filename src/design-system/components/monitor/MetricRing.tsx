'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-presets';

/** MetricRing — a small **180° open-bottom gauge** for a KPI tile. */

// Semicircle geometry — mirrors GaugeDonut so the two gauges are pixel-siblings.
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function MetricRing({
  fraction,
  toneClass,
  center,
  size = 88,
  thickness = 8,
}: {
  /** 0..1 fill fraction. */
  fraction: number;
  /** Tailwind text-color class for the arc (drives `currentColor`). */
  toneClass: string;
  center: ReactNode;
  size?: number;
  thickness?: number;
}) {
  const reduce = useReducedMotion();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2 - 2;
  const clamped = Math.max(0, Math.min(1, fraction));
  // Only the top half + a cap's breathing room is ever painted.
  const height = size / 2 + thickness / 2 + 4;

  const trackD = arcPath(cx, cy, r, 180, 360);
  const valueD = arcPath(cx, cy, r, 180, 180 + Math.max(0.001, clamped) * 180);

  return (
    <div className="relative shrink-0" style={{ width: size, height }}>
      <svg width={size} height={height} className="overflow-visible" aria-hidden="true">
        <g className="text-surface-strong">
          <path d={trackD} fill="none" stroke="currentColor" strokeWidth={thickness} strokeLinecap="round" />
        </g>
        {clamped > 0 && (
          <g className={toneClass}>
            <motion.path
              d={valueD}
              fill="none"
              stroke="currentColor"
              strokeWidth={thickness}
              strokeLinecap="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : 0.7, ease: motionBezier.easeOut }}
            />
          </g>
        )}
      </svg>
      {/* Value sits low-center, in the bowl just above the flat diameter line —
          the same seat GaugeDonut uses for its center readout. */}
      <div className="absolute inset-0 flex items-end justify-center" style={{ paddingBottom: r * 0.16 }}>
        <div className="flex flex-col items-center text-center leading-none">{center}</div>
      </div>
    </div>
  );
}

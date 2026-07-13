'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/_cn';

export interface GaugeSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface GaugeDonutProps {
  segments: GaugeSegment[];
  /** Defaults to the sum of segment values. */
  total?: number;
  centerLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
  /** Enable per-arc hover: the hovered arc lifts, the others dim, and the center
   *  readout swaps to that segment's label · value · share. */
  interactive?: boolean;
  /**
   * Monitor filter-only click: when set, arcs become toggle affordances. Clicking
   * an arc calls `onSelect(key)`; the `activeKey` arc stays lit (raised, others
   * dimmed) even without hover — the visual twin of the toolbar legend's lit chip.
   * Keyboard access is provided by that legend; the arcs are a secondary pointer
   * affordance, so they add focus semantics but never a durable selection.
   */
  onSelect?: (key: string) => void;
  /** The currently-filtered segment key (drives the lit/pinned arc). */
  activeKey?: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function GaugeDonut({
  segments,
  total,
  centerLabel = 'Events',
  size = 200,
  thickness = 16,
  className,
  interactive = false,
  onSelect,
  activeKey = null,
}: GaugeDonutProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const clickable = Boolean(onSelect);
  // Hover wins for pointer feedback; the active (filtered) arc stays lit at rest.
  const litKey = hoverKey ?? activeKey;
  const sum = total ?? segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2 - 4;
  const height = size / 2 + 14;

  const arcs = useMemo(() => {
    if (sum <= 0) return [] as { key: string; color: string; d: string }[];
    const gap = segments.length > 1 ? 3 : 0;
    let acc = 0;
    return segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const startFrac = acc / sum;
        acc += s.value;
        const endFrac = acc / sum;
        const a0 = 180 + startFrac * 180;
        const a1 = 180 + endFrac * 180 - gap;
        return { key: s.key, color: s.color, d: arcPath(cx, cy, r, a0, Math.max(a0, a1)) };
      });
  }, [segments, sum, cx, cy, r]);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg width={size} height={height} role="img" aria-label={`${centerLabel} gauge`}>
        {/* track */}
        <g className="text-surface-strong">
          <path
            d={arcPath(cx, cy, r, 180, 360)}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            strokeLinecap="round"
          />
        </g>
        {arcs.map((arc, i) => {
          const lit = litKey === arc.key;
          const dimmed = litKey != null && !lit;
          const hoverable = interactive || clickable;
          return (
            <motion.path
              key={arc.key}
              d={arc.d}
              fill="none"
              stroke={arc.color}
              strokeWidth={lit ? thickness + 3 : thickness}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: dimmed ? 0.28 : 1 }}
              transition={{
                pathLength: { duration: 0.7, delay: 0.1 + i * 0.08, ease: EASE },
                opacity: { duration: 0.15 },
                strokeWidth: { duration: 0.12 },
              }}
              className={clickable ? 'outline-none focus-visible:opacity-100' : undefined}
              style={hoverable ? { cursor: 'pointer' } : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={clickable ? `Filter board to ${arc.key.replace(/_/g, ' ').toLowerCase()}` : undefined}
              aria-pressed={clickable ? activeKey === arc.key : undefined}
              onMouseEnter={hoverable ? () => setHoverKey(arc.key) : undefined}
              onMouseLeave={hoverable ? () => setHoverKey(null) : undefined}
              onFocus={clickable ? () => setHoverKey(arc.key) : undefined}
              onBlur={clickable ? () => setHoverKey(null) : undefined}
              onClick={clickable ? () => onSelect?.(arc.key) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(arc.key);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
        {/* center readout — currentColor so it inherits the dark-mode remap. On
            hover the readout swaps to the hovered segment's value + label. */}
        {(() => {
          const hovered = litKey ? segments.find((s) => s.key === litKey) : null;
          const bigText = hovered ? hovered.value.toLocaleString() : sum.toLocaleString();
          const subText = hovered
            ? `${hovered.label} · ${sum > 0 ? Math.round((hovered.value / sum) * 100) : 0}%`
            : centerLabel;
          return (
            <>
              <g style={hovered ? { fill: hovered.color } : undefined} className={hovered ? undefined : 'text-text-default'}>
                <text x={cx} y={cy - r * 0.18} textAnchor="middle" fill={hovered ? hovered.color : 'currentColor'} className="text-2xl font-black tabular-nums">
                  {bigText}
                </text>
              </g>
              <g className="text-text-faint">
                <text x={cx} y={cy + 4} textAnchor="middle" fill="currentColor" className="text-role-micro font-bold uppercase tracking-[0.14em]">
                  {subText}
                </text>
              </g>
            </>
          );
        })()}
      </svg>
    </div>
  );
}

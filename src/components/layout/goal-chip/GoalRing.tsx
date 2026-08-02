import { motion } from '@/design-system/motion';

/** Header / chrome progress ring — stroke matches house icon brush (2). */
const DEFAULT_STROKE = 2;

/** Light track — shared by header goal + station expand rings. */
const TRACK_STROKE = '#E5E7EB';

/**
 * Animated SVG progress ring. Header chips show the integer percent in the
 * center (`showValue`); station expand chrome uses the ring alone.
 */
export function GoalRing({
  percent,
  color,
  size = 16,
  strokeWidth = DEFAULT_STROKE,
  showValue = true,
}: {
  percent: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  /** When false, omit the center numeral (station expand chrome). Default true. */
  showValue?: boolean;
}) {
  const r = size / 2 - strokeWidth;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={TRACK_STROKE}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ type: 'spring', stiffness: 120, damping: 22, mass: 0.8 }}
        />
      </svg>
      {showValue ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-semibold tabular-nums tracking-tight text-text-default"
            style={{ fontSize: Math.max(7, size * 0.3) }}
          >
            {clamped}
          </span>
        </div>
      ) : null}
    </div>
  );
}

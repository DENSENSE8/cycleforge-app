import { motion } from 'framer-motion';

/** Header / chrome progress ring — stroke matches house icon brush (2). */
const DEFAULT_STROKE = 2;

/** Animated SVG progress ring with the integer percent in its center. */
export function GoalRing({
  percent,
  color,
  size = 16,
  strokeWidth = DEFAULT_STROKE,
}: {
  percent: number;
  color: string;
  size?: number;
  strokeWidth?: number;
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
          stroke="#E5E7EB"
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
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-semibold tabular-nums tracking-tight text-text-default"
          style={{ fontSize: Math.max(7, size * 0.3) }}
        >
          {clamped}
        </span>
      </div>
    </div>
  );
}

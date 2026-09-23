'use client';

import { motion, motionRole, useMotionPressRole } from '@/design-system/motion';
import { getStaffThemeById, stationThemeClasses } from '@/utils/staff-colors';
import { fieldLabel } from '@/design-system/tokens/typography/presets';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export interface StaffOption {
  id: number;
  name: string;
}

interface StaffButtonGridProps {
  label: string;
  options: StaffOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  columns?: number;
  emptyMessage?: string;
  className?: string;
}

export function StaffButtonGrid({
  label,
  options = [],
  selectedId,
  onSelect,
  columns,
  emptyMessage = 'None available',
  className,
}: StaffButtonGridProps) {
  // `motionRole.gesture.press` — suppressed, not reduced, under prefers-reduced-motion.
  // This grid used to pass the tap target unguarded, so the floor SNAPPED the 0.9
  // scale (transforms are positional keys) and the press read as a glitch.
  const pressGesture = useMotionPressRole(motionRole.gesture.press);
  const roster = Array.isArray(options) ? options : [];
  const cols = Math.min(columns ?? roster.length, roster.length);

  return (
    <div className={className}>
      <p className="mb-2 text-role-eyebrow uppercase tracking-[0.22em] text-text-soft">{label}</p>
      {roster.length > 0 ? (
        <div
          className="grid w-full gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}
        >
          {roster.map((m) => {
            const active = selectedId === m.id;
            const cls = stationThemeClasses[getStaffThemeById(m.id)];
            return (
              <motion.button
                key={m.id}
                type="button"
                whileTap={pressGesture}
                onClick={() => onSelect(m.id)}
                className={cn(
                  'touch-manipulation flex h-11 w-full min-w-0 flex-col items-center justify-center border-2 px-2 transition-colors',
                  cornerClass('control'),
                  active ? `${cls.active} border-transparent` : cls.inactive,
                )}
              >
                <span className="w-full text-center text-role-micro uppercase leading-tight tracking-[0.04em]">
                  {m.name}
                </span>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <p className={`${fieldLabel} text-text-soft`}>{emptyMessage}</p>
      )}
    </div>
  );
}

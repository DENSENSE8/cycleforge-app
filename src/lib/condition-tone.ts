import {
  conditionGradeTableLabel,
  EMPTY_META_DASH,
  resolveConditionGrade,
  type ConditionGrade,
} from '@/lib/conditions';

/** Visual tone per condition grade — shared by picker pills and inline badges. */
type ConditionGradeTone = {
  /** Selected pill (filled). */
  active: string;
  /** Unselected pill (outline). */
  inactive: string;
  /** Static badge (non-interactive). */
  badge: string;
  /** Inline text/badge color matching the active pill hue. */
  text: string;
  /** {@link CopyChip} icon color — matches active pill hue. */
  chipIconClass: string;
  /** Solid dot fill for a status-token chip (`bg-*`), matching the active pill hue. */
  dotClass: string;
  /**
   * Solid chip — fill + ink, ≥ 4.5:1 (the industrial condition chip, owner
   * 2026-09-25). The fill is the grade's text hue, a step darker where white
   * on it would fail (teal / emerald -700).
   */
  solid: string;
};

/** Props for a house `GridStatusCellValue` condition face. */
type ConditionGradeStatusChip = {
  label: string;
  /** Pastel fill + ink (`bg-* text-*`). Chip ring comes from GridStatusCellValue. */
  toneClass: string;
  dotClass: string;
};

/**
 * Single source of truth for condition-grade color. {@link ConditionPills} and
 * inline meta badges (PO line rows, unit slots) import from here so a grade
 * always reads the same hue everywhere.
 */
export const CONDITION_GRADE_TONE: Record<ConditionGrade, ConditionGradeTone> = {
  BRAND_NEW: {
    active: 'bg-yellow-500 text-white shadow-none ring-yellow-600',
    inactive: 'bg-surface-card text-yellow-800 ring-yellow-200 hover:bg-yellow-50',
    badge: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    text: 'text-text-warning',
    chipIconClass: 'inline-flex items-center justify-center text-text-warning',
    dotClass: 'bg-yellow-500',
    solid: 'bg-orange-700 text-white',
  },
  LIKE_NEW: {
    active: 'bg-teal-600 text-white shadow-none ring-teal-700',
    inactive: 'bg-surface-card text-teal-800 ring-teal-200 hover:bg-teal-50',
    badge: 'bg-teal-50 text-teal-700 ring-teal-200',
    // -700: teal-600 as text is 3.74:1 on white (owner 2026-09-25: too faint).
    text: 'text-teal-700',
    chipIconClass: 'inline-flex items-center justify-center text-teal-700',
    dotClass: 'bg-teal-600',
    solid: 'bg-teal-700 text-white',
  },
  REFURBISHED: {
    active: 'bg-indigo-600 text-white shadow-none ring-indigo-700',
    inactive: 'bg-surface-card text-indigo-800 ring-indigo-200 hover:bg-indigo-50',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    text: 'text-indigo-600',
    chipIconClass: 'inline-flex items-center justify-center text-indigo-600',
    dotClass: 'bg-indigo-600',
    solid: 'bg-indigo-600 text-white',
  },
  USED_A: {
    active: 'bg-emerald-600 text-white shadow-none ring-emerald-700',
    inactive: 'bg-surface-card text-emerald-800 ring-emerald-200 hover:bg-emerald-50',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    // -700: emerald-600 as text is 3.77:1 on white (owner 2026-09-25: too faint).
    text: 'text-emerald-700',
    chipIconClass: 'inline-flex items-center justify-center text-emerald-700',
    dotClass: 'bg-emerald-600',
    solid: 'bg-emerald-700 text-white',
  },
  USED_B: {
    active: 'bg-blue-600 text-white shadow-none ring-blue-700',
    inactive: 'bg-surface-card text-blue-800 ring-blue-200 hover:bg-blue-50',
    badge: 'bg-blue-50 text-blue-700 ring-blue-200',
    text: 'text-blue-600',
    chipIconClass: 'inline-flex items-center justify-center text-blue-600',
    dotClass: 'bg-blue-600',
    solid: 'bg-blue-600 text-white',
  },
  USED_C: {
    // ds-allow-raw-neutral: identity/tone hue — USED_C's slate among emerald/blue/amber grade hues, not chrome
    active: 'bg-slate-700 text-white shadow-none ring-slate-800',
    inactive: 'bg-surface-card text-text-muted ring-border-soft hover:bg-surface-hover',
    badge: 'bg-surface-sunken text-text-muted ring-border-soft',
    text: 'text-text-muted',
    chipIconClass: 'inline-flex items-center justify-center text-text-muted',
    dotClass: 'bg-slate-700', // ds-allow-raw-neutral: identity/tone hue — USED_C slate dot
    solid: 'bg-slate-600 text-white', // ds-allow-raw-neutral: identity/tone hue — USED_C slate chip
  },
  PARTS: {
    // Brown (orange-900) — must stay distinct from BRAND_NEW yellow; amber
    // read as the same warm highlight on the grade bar.
    active: 'bg-orange-900 text-white shadow-none ring-orange-900',
    inactive: 'bg-surface-card text-orange-900 ring-orange-200 hover:bg-orange-50',
    badge: 'bg-orange-50 text-orange-900 ring-orange-200',
    text: 'text-orange-900',
    chipIconClass: 'inline-flex items-center justify-center text-orange-900',
    dotClass: 'bg-orange-900',
    solid: 'bg-orange-900 text-white',
  },
};

const FALLBACK_TONE = CONDITION_GRADE_TONE.USED_C;

export function normalizeConditionGrade(code: string | null | undefined): string {
  return String(code || '').trim().toUpperCase();
}

export function conditionGradeTone(code: string | null | undefined): ConditionGradeTone {
  // Resolve marketplace aliases ("NEW", "L-NEW", "A", …) to grade codes so
  // order rows color exactly like grade-coded inventory; unknowns (incl. bare
  // "USED") keep the neutral fallback.
  const c = resolveConditionGrade(code) as ConditionGrade;
  return CONDITION_GRADE_TONE[c] ?? FALLBACK_TONE;
}

/** Text color class for inline condition labels (meta rows, badges). */
export function conditionGradeTextClass(code: string | null | undefined): string {
  return conditionGradeTone(code).text;
}

/** Dot-led status-token face for dense grids (legacy Product micro-tag / board surfaces). */
export function conditionGradeStatusChip(
  code: string | null | undefined,
): ConditionGradeStatusChip | null {
  const label = conditionGradeTableLabel(code);
  if (!label || label === EMPTY_META_DASH) return null;
  const tone = conditionGradeTone(code);
  // Badge SoT also carries a grade ring for standalone pills; the house status
  // chip owns `ring-current/20`, so strip ring-* here to avoid stacking.
  const toneClass = tone.badge
    .split(/\s+/)
    .filter((token) => token.length > 0 && !token.startsWith('ring-'))
    .join(' ');
  return { label, toneClass, dotClass: tone.dotClass };
}

/**
 * Marketplace / order-queue condition string tone (NEW / USED / `--` — not only grade codes).
 * NEW / BRAND_NEW warns; PARTS is brown (orange-900); empty dash + everything else muted for scan.
 */
export function orderRowConditionTone(condition: string | null | undefined): string {
  const normalized = String(condition || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!normalized || normalized === 'N/A' || normalized === '--' || normalized === '—' || normalized === '---') { // ds-allow-na: condition empty-vocab reader
    return 'text-text-muted';
  }
  if (normalized === 'NEW' || normalized === 'BRAND_NEW') return 'text-text-warning';
  if (normalized === 'PARTS') return 'text-orange-900';
  return 'text-text-muted';
}

/** Qty fact in order/shipped meta — multi-qty warns; single stays muted. */
export function orderRowQtyTone(qty: number): string {
  return qty > 1 ? 'text-text-warning' : 'text-text-muted';
}

/** Icon classes for a {@link CopyChip} condition readout. */
function conditionGradeChipStyle(code: string | null | undefined): {
  iconClass: string;
} {
  const tone = conditionGradeTone(code);
  return { iconClass: tone.chipIconClass };
}

const PENDING_CHIP_STYLE = {
  iconClass: 'inline-flex items-center justify-center text-text-faint',
} as const;

export function conditionGradeChipStyleOrPending(code: string | null | undefined): {
  iconClass: string;
  isPending: boolean;
} {
  const normalized = normalizeConditionGrade(code);
  const isPending = !normalized || normalized === 'PENDING';
  if (isPending) return { ...PENDING_CHIP_STYLE, isPending: true };
  return { ...conditionGradeChipStyle(normalized), isPending: false };
}

/** Density for expanded grade segments. */
export type ConditionPillDensity = 'pill' | 'barDistribute';

/** Tailwind classes for a single condition picker pill — square flush face. */
export function conditionPillClass(
  gradeValue: string,
  isActive: boolean,
  density: ConditionPillDensity = 'pill',
): string {
  const tone = conditionGradeTone(gradeValue);
  // Same h-11 as Tags / image / serial cells — expanded grades fill the
  // joined bar edge-to-edge (no top/bottom float). Never soft py that
  // shrinks the face inside the row.
  if (density === 'barDistribute') {
    // Full-name progressive strip:
    const stack = isActive ? 'relative z-raised' : 'relative z-base hover:z-raised';
    return `${stack} inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-none p-0 text-center text-role-caption font-semibold leading-tight ring-1 ring-inset transition-colors active:scale-[0.98] ${
      isActive ? tone.active : tone.inactive
    }`;
  }
  // Compact pill strip: horizontal label inset + uppercase abbreviation.
  // No stacking context here — the `scroll` density is Testing / Units /
  // shipped, which are out of scope for the Unbox-first border pass.
  return `inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-none px-2.5 text-role-caption font-semibold uppercase tracking-[0.1em] ring-1 ring-inset transition-colors active:scale-[0.98] ${
    isActive ? tone.active : tone.inactive
  }`;
}

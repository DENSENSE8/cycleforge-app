'use client';

import { conditionTextColor } from '@/lib/conditions';

interface ConditionTextProps {
  condition: string | null | undefined;
  quantity?: number;
  productTitle?: string;
  className?: string;
}

/** Tailwind text color class for an item condition (new→yellow-500, parts→orange-900 brown, else→black). */
const getConditionColor = conditionTextColor;

/**
 * Formats a raw condition string for display.
 * Strips underscores, handles empty / "FBA SCAN" → honest-absence dash.
 */
function formatConditionLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, ' ');
  if (!raw || normalized === 'FBA SCAN') return '—';
  return raw.replaceAll('_', ' ');
}

/** Inline condition + qty + title display. */
function ConditionText({
  condition,
  quantity = 1,
  productTitle = '',
  className = '',
}: ConditionTextProps) {
  const conditionLabel = formatConditionLabel(condition);
  const conditionColor = getConditionColor(condition);

  return (
    <h4 className={`text-base font-semibold text-text-default leading-tight ${className}`.trim()}>
      {quantity >= 2 && <span className="text-yellow-500">x{quantity} </span>}
      <span className={conditionColor}>{conditionLabel}</span>
      {productTitle && ` ${productTitle}`}
    </h4>
  );
}

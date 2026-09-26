'use client';

import { LIFECYCLE, type StateName } from '../tokens/lifecycle';
import { UnderlineValue } from './UnderlineValue';

type StatusTone = 'neutral' | 'blue' | 'orange' | 'red' | 'green' | 'purple' | 'yellow';

/** Functional state tone → this vocabulary's hue (lifecycle states resolve here). */
const STATUS_TONE_FOR_STATE: Record<StateName, StatusTone> = {
  info: 'blue',
  warning: 'orange',
  fulfillment: 'purple',
  danger: 'red',
  success: 'green',
};

const statusToneMap: Record<string, StatusTone> = {
  active: 'green',
  confirmed: 'blue',
  packed: STATUS_TONE_FOR_STATE[LIFECYCLE.packed.tone],
  shipped: STATUS_TONE_FOR_STATE[LIFECYCLE.shipped.tone],
  delivered: 'green',
  success: 'green',
  warning: 'yellow',
  overdue: 'red',
  error: 'red',
  danger: 'red',
  out_of_stock: 'red',
  low_stock: 'orange',
  queued: 'yellow',
  pending: 'yellow',
  logistics: 'blue',
  fulfillment: 'purple',
  repair: 'orange',
  inactive: 'neutral',
};

interface StatusMicroLabelProps {
  status: string;
  label?: string;
  className?: string;
}

function normalize(status: string) {
  return String(status || '').trim().toLowerCase();
}

function toLabel(status: string) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatusMicroLabel({ status, label, className = '' }: StatusMicroLabelProps) {
  const normalized = normalize(status);
  const tone = statusToneMap[normalized] || 'neutral';
  const resolvedLabel = label || toLabel(normalized || 'Unknown');

  return (
    <UnderlineValue
      value={<span className="text-role-eyebrow uppercase tracking-[0.08em] leading-none">{resolvedLabel}</span>}
      tone={tone}
      className={className}
      truncate={false}
    />
  );
}

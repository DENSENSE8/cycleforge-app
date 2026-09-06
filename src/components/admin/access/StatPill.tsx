'use client';

interface StatPillProps {
  label: string;
  value: number;
  tone?: 'gray' | 'green' | 'blue' | 'purple';
}

const TONE: Record<string, { bg: string; text: string; value: string }> = {
  gray:   { bg: 'bg-surface-sunken',    text: 'text-text-muted',    value: 'text-text-default' },
  green:  { bg: 'bg-surface-success',   text: 'text-text-success',   value: 'text-text-success' },
  blue:   { bg: 'bg-surface-info',    text: 'text-text-info',    value: 'text-text-info' },
  purple: { bg: 'bg-purple-100',  text: 'text-purple-700',  value: 'text-purple-900' },
};

export function StatPill({ label, value, tone = 'gray' }: StatPillProps) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-role-caption font-medium ${t.bg}`}>
      <span className={`uppercase tracking-wider ${t.text}`}>{label}</span>
      <span className={`tabular-nums font-semibold ${t.value}`}>{value}</span>
    </span>
  );
}

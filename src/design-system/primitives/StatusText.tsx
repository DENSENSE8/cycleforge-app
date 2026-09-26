'use client';

/**
 * The status WORD — the one status face in the product (`StatusBadge` is its only caller, and ~35 surfaces mount that).
 * ## No underline (operator 2026-09-13)
 */
interface StatusTextProps {
  label: string;
  colorVar: string;
  className?: string;
}

export function StatusText({ label, colorVar, className = '' }: StatusTextProps) {
  return (
    <span
      className={`inline-flex items-center text-role-eyebrow uppercase tracking-[0.08em] leading-none ${className}`.trim()}
      style={{ color: `var(${colorVar})` }}
    >
      {label}
    </span>
  );
}

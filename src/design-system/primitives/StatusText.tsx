'use client';

/**
 * The status WORD — the one status face in the product (`StatusBadge` is its
 * only caller, and ~35 surfaces mount that).
 *
 * ## No underline (operator 2026-09-13)
 *
 * It used to carry `border-b-2 border-current` under the word. That rule was
 * removed on sight: *"the underline under the status is not needed."*
 *
 * The reasoning holds beyond taste. The mono-display law asks a state never to
 * be carried by COLOUR ALONE — and this face already satisfies it twice over,
 * because it prints the state as a WORD in an uppercase eyebrow. The rule was
 * a third carrier for a fact that already had two, and it cost more than it
 * said: a 2px line under a short uppercase word is the exact silhouette of an
 * active tab and of a text link, so `DELIVERED` read as something to press on
 * a surface where it is a label.
 *
 * What remains is the word, its semantic hue, and the eyebrow's tracking. Do
 * not reintroduce a border, a chip fill, or a pill here — a status that needs
 * a CONTAINER is `StatusMark` (dot + word inside a ring) on a dense row, not
 * this face on a record header.
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

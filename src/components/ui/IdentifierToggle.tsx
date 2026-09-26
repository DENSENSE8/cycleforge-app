'use client';

/** A small segmented toggle used in timeline/journey headers — e.g. */

interface IdentifierToggleOption<T extends string> {
  value: T;
  label: string;
}

export function IdentifierToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel = 'Grouping',
  variant = 'rail',
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<IdentifierToggleOption<T>>;
  ariaLabel?: string;
  variant?: 'rail' | 'bare';
}) {
  const bare = variant === 'bare';
  return (
    <div
      className={
        bare
          ? 'inline-flex items-center gap-1'
          : 'inline-flex items-center gap-0.5 rounded-md bg-surface-sunken p-0.5'
      }
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`ds-raw-button rounded px-2 py-0.5 text-role-eyebrow font-semibold uppercase tracking-[0.1em] transition-colors ${
              bare
                ? active
                  ? 'bg-surface-sunken text-text-default'
                  : 'text-text-faint hover:text-text-muted'
                : active
                  ? 'bg-surface-card text-text-muted shadow-sm'
                  : 'text-text-faint hover:text-text-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

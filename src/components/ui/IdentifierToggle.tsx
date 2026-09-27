'use client';

/**
 * A small segmented toggle used in timeline/journey headers and as the ⌘K
 * palette's search-method pills (`bare`). Labels speak the region's VOICE
 * (`mode-label-case`): sentence case in triage, caps on the industrial floor.
 * `bare` options are the triage pill chips (`rounded-mode-pill`).
 */

interface IdentifierToggleOption<T extends string> {
  value: T;
  label: string;
  /**
   * `bare` only — the option's identity colour: a dot before the label, and
   * the selected pill's wash + ring (e.g. ticket orange, serial green).
   */
  tone?: { dot: string; selected: string } | null;
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
            className={`ds-raw-button inline-flex items-center gap-1.5 transition-colors mode-label-case ${
              bare
                ? `rounded-mode-pill px-2.5 py-1 text-role-caption font-medium ${
                    active
                      ? (o.tone?.selected ?? 'bg-surface-sunken text-text-default ring-1 ring-inset ring-border-soft')
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text-default'
                  }`
                : `rounded px-2 py-0.5 text-role-eyebrow font-semibold ${
                    active ? 'bg-surface-card text-text-muted shadow-sm' : 'text-text-faint hover:text-text-muted'
                  }`
            }`}
          >
            {bare && o.tone ? <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${o.tone.dot}`} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

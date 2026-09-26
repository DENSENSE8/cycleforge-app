'use client';

/** One click-off wrapper for the carton face top-left: */

import { Check } from '@/components/Icons';
import { chipLabel } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';
import { useMemo } from 'react';
import {
  usePlatformCatalog,
  usePlatformTypeRules,
  useReceivingTypeCatalog,
} from '@/hooks/useCatalog';
import {
  allowedTypesForPlatform,
  defaultTypeForPlatform,
} from '@/lib/receiving/platform-type-rules';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { catalogIdentityDot } from '@/components/receiving/workspace/line-edit/classify-pill-options';
import { LABEL_PLATFORM_SPECIALS } from '@/components/receiving/workspace/line-edit/LabelEditPopover';

const ROW =
  'ds-raw-button flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-role-caption font-semibold transition-colors hover:bg-surface-hover';

function IdentityDot({
  kind,
  value,
  label,
  colorHex,
}: {
  kind: 'platform' | 'type';
  value: string;
  label: string;
  colorHex?: string | null;
}) {
  const dot = catalogIdentityDot({ kind, value, label, colorHex });
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', dot.className)}
      style={dot.style}
      aria-hidden
    />
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="border-b border-border-hairline px-2.5 py-1.5">
      <span className={cn(chipLabel, 'text-text-muted')}>{label}</span>
    </div>
  );
}

function platformRowLabel(label: string, slug: string | null): string {
  const meta = sourcePlatformMeta(slug ?? label);
  if (meta.value) return meta.label;
  return sentenceCaseLabel(label);
}

export function LabelPlatformTypeMenu({
  platform,
  receivingType,
  onPlatformChange,
  onTypeChange,
}: {
  platform: string;
  receivingType: string;
  onPlatformChange: (next: { label: string; slug: string | null }) => void;
  onTypeChange: (slug: string) => void;
}) {
  const platformCat = usePlatformCatalog();
  const typeCat = useReceivingTypeCatalog();
  const rules = usePlatformTypeRules();

  const platforms = useMemo(() => {
    const fromCat = platformCat.options.map((o) => ({
      label: o.label,
      // `string | null`, widened like `colorHex` below:
      slug: o.value as string | null,
      colorHex: o.colorHex ?? null,
    }));
    const specials = LABEL_PLATFORM_SPECIALS.filter(
      (s) => !fromCat.some((p) => p.label === s),
    ).map((s) => ({
      label: s,
      slug: s.toLowerCase().replace(/\s+/g, '-'),
      colorHex: null as string | null,
    }));
    const merged = [...fromCat, ...specials];
    if (platform && !merged.some((p) => p.label === platform)) {
      merged.unshift({ label: platform, slug: null, colorHex: null });
    }
    return merged;
  }, [platformCat.options, platform]);

  const platformSlug =
    platforms.find((p) => p.label === platform)?.slug ??
    platformCat.options.find((o) => o.label === platform)?.value ??
    null;

  const allowed = allowedTypesForPlatform(rules, platformSlug);
  const types = useMemo(() => {
    const all = typeCat.options;
    if (allowed == null) return all;
    return all.filter((o) => allowed.includes(o.value.toUpperCase()));
  }, [typeCat.options, allowed]);

  const typeValue = receivingType.trim().toUpperCase();

  return (
    <div className="flex min-w-[12.5rem] max-w-[16rem] flex-col" data-label-platform-type-menu="">
      <section>
        <SectionHead label="Platform" />
        <ul className="max-h-40 overflow-y-auto py-0.5" role="listbox" aria-label="Platform">
          {platforms.map((p) => {
            const selected = p.label === platform;
            const shown = platformRowLabel(p.label, p.slug);
            return (
              <li key={`${p.slug ?? p.label}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onPlatformChange(p);
                    const nextType = defaultTypeForPlatform(rules, p.slug);
                    if (nextType) onTypeChange(nextType);
                  }}
                  className={cn(ROW, selected ? 'text-text-default' : 'text-text-soft')}
                >
                  <IdentityDot
                    kind="platform"
                    value={p.slug ?? p.label}
                    label={p.label}
                    colorHex={p.colorHex}
                  />
                  <span className="min-w-0 flex-1 truncate">{shown}</span>
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="border-t border-border-hairline">
        <SectionHead label="Type" />
        <ul className="max-h-40 overflow-y-auto py-0.5" role="listbox" aria-label="Type">
          {types.map((t) => {
            const selected = t.value.toUpperCase() === typeValue;
            return (
              <li key={t.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onTypeChange(t.value.toUpperCase())}
                  className={cn(ROW, selected ? 'text-text-default' : 'text-text-soft')}
                >
                  <IdentityDot
                    kind="type"
                    value={t.value}
                    label={t.label}
                    colorHex={t.colorHex}
                  />
                  <span className="min-w-0 flex-1 truncate">{sentenceCaseLabel(t.label)}</span>
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

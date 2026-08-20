'use client';

import { useState } from 'react';
import Link from 'next/link';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check, ChevronRight, X } from '@/components/Icons';
import {
  featureCount,
  type ProductUpdate,
  type ProductUpdateFeature,
} from '@/data/product-updates';

const EYEBROW = 'text-role-eyebrow uppercase tracking-widest text-text-accent';

function FeatureDemoSlot({ feature }: { feature: ProductUpdateFeature }) {
  if (feature.video) {
    return (
      <video
        className="mt-1.5 w-full border border-border-hairline bg-surface-sunken"
        controls
        playsInline
        poster={feature.video.poster}
        src={feature.video.mp4}
      >
        {feature.video.webm ? <source src={feature.video.webm} type="video/webm" /> : null}
        <source src={feature.video.mp4} type="video/mp4" />
      </video>
    );
  }
  return (
    <p className="mt-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
      Demo coming
    </p>
  );
}

function MajorFeatureRow({ feature }: { feature: ProductUpdateFeature }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = Boolean(feature.summary || feature.href || !feature.video);

  return (
    <div className="py-1.5">
      <button
        type="button"
        className="group flex w-full items-center gap-2 text-left hover:bg-surface-hover"
        onClick={() => canExpand && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Check className="h-3.5 w-3.5 shrink-0 text-text-success" />
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
          {feature.title}
        </span>
        {canExpand ? (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-text-faint transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-1 pl-5">
          {feature.summary ? (
            <p className="text-role-caption text-text-soft">{feature.summary}</p>
          ) : null}
          <FeatureDemoSlot feature={feature} />
          {feature.href ? (
            <Link
              href={feature.href}
              className="mt-1 inline-flex items-center gap-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-accent hover:underline"
            >
              Open
              <ChevronRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MinorFeatureRow({ feature }: { feature: ProductUpdateFeature }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-success" />
      <span className="min-w-0">
        <span className="block text-role-caption font-semibold text-text-faint">
          {feature.title}
        </span>
        {feature.summary ? (
          <span className="block text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
            {feature.summary}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function ProductUpdatesPanel({
  update,
  onDismiss,
}: {
  update: ProductUpdate;
  onDismiss: () => void;
}) {
  const [showMinor, setShowMinor] = useState(false);
  const count = featureCount(update);

  return (
    <section
      className="w-[22rem] max-w-[calc(100vw-2rem)] border border-border-hairline bg-surface-card"
      aria-label="Product updates"
    >
      <div className="rounded-none border-0 bg-surface-card px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className={EYEBROW}>{update.name}</span>
          <span className="inline-flex items-center gap-1">
            <span className="text-role-eyebrow uppercase tracking-widest leading-none text-text-soft tabular-nums">
              {count} {count === 1 ? 'feature' : 'features'}
            </span>
            <HoverTooltip label="Got it" focusable={false}>
              <IconButton
                type="button"
                ariaLabel="Dismiss product updates"
                onClick={onDismiss}
                icon={<X className="h-3.5 w-3.5 text-text-faint" />}
                className="-my-1 flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-hover"
              />
            </HoverTooltip>
          </span>
        </div>

        <div className="mt-1.5 divide-y divide-border-hairline">
          {update.major.map((feature) => (
            <MajorFeatureRow key={feature.id} feature={feature} />
          ))}
        </div>

        {update.minor.length > 0 ? (
          <div className="mt-2 border-t border-border-hairline pt-2">
            <button
              type="button"
              className="flex w-full items-center justify-between text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft hover:text-text-default"
              onClick={() => setShowMinor((v) => !v)}
              aria-expanded={showMinor}
            >
              Also in this update
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${showMinor ? 'rotate-90' : ''}`}
              />
            </button>
            {showMinor ? (
              <div className="mt-1 divide-y divide-border-hairline">
                {update.minor.map((feature) => (
                  <MinorFeatureRow key={feature.id} feature={feature} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="h-8 border border-border-hairline bg-surface-card px-3 text-role-caption font-semibold text-text-default hover:bg-surface-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </section>
  );
}

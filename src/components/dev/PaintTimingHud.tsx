'use client';

/**
 * Dev-only paint timing overlay — shows Core Web Vitals (via web-vitals) plus
 * custom Unbox surface marks. Enable with NEXT_PUBLIC_PAINT_TIMING_HUD=true.
 */

import { useEffect, useState } from 'react';
import { onCLS, onFCP, onINP, onLCP, type Metric } from 'web-vitals';
import { zIndex } from '@/design-system/tokens/z-index';
import {
  isPaintTimingHudEnabled,
  readPaintMarks,
  type PaintMarkEntry,
} from '@/lib/observability/paint-timing';

function formatMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} ms`;
}

function vitalRating(metric: Metric): string {
  const { name, value, rating } = metric;
  const label = rating === 'good' ? 'good' : rating === 'needs-improvement' ? 'warn' : 'bad';
  return `${name} ${formatMs(value)} (${label})`;
}

export function PaintTimingHud() {
  const [vitals, setVitals] = useState<string[]>([]);
  const [marks, setMarks] = useState<PaintMarkEntry[]>([]);

  useEffect(() => {
    if (!isPaintTimingHudEnabled()) return;

    const pushVital = (metric: Metric) => {
      setVitals((prev) => {
        const next = prev.filter((line) => !line.startsWith(`${metric.name} `));
        next.push(vitalRating(metric));
        return next;
      });
    };

    onFCP(pushVital);
    onLCP(pushVital);
    onINP(pushVital);
    onCLS(pushVital);

    const refreshMarks = () => setMarks(readPaintMarks());
    refreshMarks();
    window.addEventListener('cf-paint-mark', refreshMarks);
    const interval = window.setInterval(refreshMarks, 500);
    return () => {
      window.removeEventListener('cf-paint-mark', refreshMarks);
      window.clearInterval(interval);
    };
  }, []);

  if (!isPaintTimingHudEnabled()) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 max-w-xs rounded-lg border border-border-soft bg-surface-card/95 px-3 py-2 font-mono text-role-micro leading-relaxed text-text-default shadow-lg backdrop-blur-sm"
      style={{ zIndex: zIndex.splash }}
      aria-live="polite"
      aria-label="Paint timing debug HUD"
    >
      <p className="mb-1 text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
        Paint timing
      </p>
      {vitals.length > 0 ? (
        <ul className="space-y-0.5 text-text-muted">
          {vitals.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-text-faint">Waiting for vitals…</p>
      )}
      {marks.length > 0 ? (
        <>
          <p className="mb-1 mt-2 text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
            Unbox surfaces
          </p>
          <ul className="space-y-0.5 text-text-muted">
            {marks.map((m) => (
              <li key={m.surface}>
                {m.surface} {formatMs(m.at)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

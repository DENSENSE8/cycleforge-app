'use client';

import { useState } from 'react';
import pkg from '../../../../package.json';
import { Button, Panel, PanelFooter } from '@/design-system/primitives';
import { PRODUCT_NAME, PLATFORM_SUPPORT_EMAIL } from '@/lib/branding/constants';

export function AboutSection() {
  const [copied, setCopied] = useState(false);

  const chromeMatch = typeof navigator !== 'undefined'
    ? navigator.userAgent.split(' ').find((p) => p.startsWith('Chrome/'))?.slice(7)
    : undefined;

  const rows: { label: string; value: string }[] = [
    { label: 'Version', value: pkg.version },
    { label: 'Platform', value: 'web' },
    { label: 'Chromium', value: chromeMatch ?? 'unknown' },
    { label: 'User agent', value: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown' },
  ];

  async function copyDiagnostics() {
    const text = rows.map((r) => `${r.label}: ${r.value}`).join('\n') +
      `\nLocal time: ${new Date().toISOString()}\nURL: ${typeof location !== 'undefined' ? location.href : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="sr-only">About</h2>
        <p className="mt-1 text-sm text-text-muted">Build information for support and troubleshooting.</p>
      </header>

      <Panel padding="lg">
        <div className="mb-5">
          <div className="text-xl font-bold text-text-default">{PRODUCT_NAME}</div>
          <div className="text-sm text-text-muted">v{pkg.version}</div>
        </div>

        <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-[140px_1fr] sm:gap-x-4">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-xs font-medium text-text-muted">{r.label}</dt>
              <dd className="break-all font-mono text-xs text-text-default">{r.value}</dd>
            </div>
          ))}
        </dl>

        <PanelFooter>
          <Button type="button" size="sm" variant="primary" onClick={copyDiagnostics}>
            {copied ? 'Copied ✓' : 'Copy diagnostics'}
          </Button>
          <a
            href={`mailto:${PLATFORM_SUPPORT_EMAIL}?subject=${encodeURIComponent(`${PRODUCT_NAME} support`)}`}
            className="rounded-xl border border-border-soft bg-surface-card px-4 py-2 text-xs font-semibold text-text-default hover:bg-surface-canvas"
          >
            Contact support
          </a>
        </PanelFooter>
      </Panel>
    </div>
  );
}

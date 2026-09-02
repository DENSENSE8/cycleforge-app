/**
 * Dry-run / preview types.
 *
 * A dry run must use the same normalization and validation as the real
 * operation — never a separate fake implementation. Phase 1 ships the
 * preview shape + a no-write wrapper; import adapters opt in by accepting
 * `{ preview: true }` and returning this structure instead of writing.
 */

export interface DryRunBucket {
  kind: string;
  count: number;
  samples?: string[];
  reason?: string;
}

export interface DryRunProviderCall {
  provider: string;
  environment: string;
  operation: string;
}

export interface DryRunPreview {
  wouldCreate: DryRunBucket[];
  wouldUpdate: DryRunBucket[];
  wouldSkip: DryRunBucket[];
  wouldCall: DryRunProviderCall[];
  notes?: string[];
}

export function emptyDryRunPreview(): DryRunPreview {
  return { wouldCreate: [], wouldUpdate: [], wouldSkip: [], wouldCall: [] };
}

export function summarizeDryRun(preview: DryRunPreview): string[] {
  const lines: string[] = [];
  const fmt = (label: string, buckets: DryRunBucket[]) => {
    if (buckets.length === 0) return;
    lines.push(`${label}:`);
    for (const b of buckets) {
      const reason = b.reason ? ` (${b.reason})` : '';
      lines.push(`  ${b.count} ${b.kind}${reason}`);
    }
  };
  fmt('Would create', preview.wouldCreate);
  fmt('Would update', preview.wouldUpdate);
  fmt('Would skip', preview.wouldSkip);
  if (preview.wouldCall.length) {
    lines.push('Would call:');
    for (const c of preview.wouldCall) {
      lines.push(`  ${c.provider} ${c.environment} ${c.operation}`);
    }
  }
  return lines;
}

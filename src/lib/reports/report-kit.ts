/**
 * Report kit — the shared vocabulary every operator report is built from.
 *
 * Five questions, one artifact kind (`report` in `ui-artifacts.ts`), one
 * renderer. What a question contributes is DATA: a headline, some KPIs with
 * verdicts, one or two tables, and the standards its arithmetic used. This
 * module holds the formatting and the verdict rules so two reports cannot
 * disagree about what "watch" means or how a dollar figure is written.
 *
 * Everything here is pure. No SQL, no `server-only`, no clock reads except
 * through the injected `now` — so a report's math is unit-testable without a
 * database and without a fixed system time.
 */

import { DEFAULT_TIER_MINUTES } from '@/lib/packing/pack-tier-classifier';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportStandard,
} from '@/lib/assistant/ui-artifacts';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';

/** The operator's timezone. Every day boundary and every `asOf` uses it. */
export const OPERATOR_TZ = 'America/Los_Angeles';

export function operatorDay(now: Date): string {
  // en-CA gives YYYY-MM-DD, which is what every dayPst parameter expects.
  return new Intl.DateTimeFormat('en-CA', { timeZone: OPERATOR_TZ }).format(now);
}

export function operatorStamp(now: Date): string {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATOR_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);
  return `${s} PT`;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function money(amount: string | number | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.trunc(n).toLocaleString('en-US');
}

/**
 * Minutes as an operator reads a shift: `0`, `45m`, `2h 05m`, `1d 3h`.
 * Never a bare decimal — "7.5" on a warehouse report is a question, not a fact.
 */
export function minutes(total: number | null | undefined): string {
  if (total === null || total === undefined || !Number.isFinite(total)) return '—';
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem === 0 ? `${h}h` : `${h}h ${String(rem).padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function percent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function days(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const d = Math.trunc(n);
  return d === 1 ? '1 day' : `${d.toLocaleString('en-US')} days`;
}

// ─── Verdicts ────────────────────────────────────────────────────────────────

export type ReportStatus = ArtifactReportKpi['status'];

/**
 * Verdict for a metric where HIGHER is better (efficiency, units per hour).
 * `watch` is the band between the two thresholds — the point of three states is
 * that "not yet bad" and "fine" are different instructions to an owner.
 */
export function statusAbove(value: number | null, good: number, watch: number): ReportStatus {
  if (value === null || !Number.isFinite(value)) return 'neutral';
  if (value >= good) return 'good';
  if (value >= watch) return 'watch';
  return 'bad';
}

/** Verdict for a metric where LOWER is better (wait minutes, backlog age). */
export function statusBelow(value: number | null, good: number, watch: number): ReportStatus {
  if (value === null || !Number.isFinite(value)) return 'neutral';
  if (value <= good) return 'good';
  if (value <= watch) return 'watch';
  return 'bad';
}

// ─── Declared standards ──────────────────────────────────────────────────────

/**
 * The pack standard, as printed on any report whose math uses earned minutes.
 * Sourced from `DEFAULT_TIER_MINUTES` so the report can never quote a number
 * the SQL did not actually apply.
 */
export function packStandards(): ArtifactReportStandard[] {
  return [
    {
      label: 'Small item',
      value: String(DEFAULT_TIER_MINUTES.SMALL),
      unit: 'min/box',
      note: 'Pack-and-label parts: boards, cables, remotes, adapters. Little or no prep.',
    },
    {
      label: 'Medium item',
      value: String(DEFAULT_TIER_MINUTES.MEDIUM),
      unit: 'min/box',
      note: 'Semi-complete units needing clean, accessories, PSU, remote, careful pack.',
    },
    {
      label: 'Big item',
      value: String(DEFAULT_TIER_MINUTES.LARGE),
      unit: 'min/box',
      note: 'Full heavy systems: Lifestyle / home theater stacks, multi-component, double-box.',
    },
  ];
}

/** Earned (standard) minutes for a tier mix — the basis of every efficiency number. */
export function earnedMinutes(mix: { small: number; medium: number; large: number }): number {
  return (
    mix.small * DEFAULT_TIER_MINUTES.SMALL +
    mix.medium * DEFAULT_TIER_MINUTES.MEDIUM +
    mix.large * DEFAULT_TIER_MINUTES.LARGE
  );
}

// ─── Envelope ────────────────────────────────────────────────────────────────

/**
 * Wrap a finished report for the tool return. The `summary` is the ONLY thing
 * the model sees (see `tool-artifact.ts`), so it must be a sentence an operator
 * would say out loud — not a restatement of the table.
 */
export function reportEnvelope(report: ArtifactReport, summary: string): ToolArtifactEnvelope {
  return { artifact: report, summary };
}

/**
 * A report with nothing in it. An empty backlog and a broken query are not the
 * same answer, and an owner must be able to tell them apart at a glance — so
 * "zero" is a rendered report with a headline of 0 and a note saying what was
 * checked, never a blank panel or a shrug in prose.
 */
export function emptyReport(args: {
  title: string;
  question: string;
  now: Date;
  scope: string;
  label: string;
  note: string;
  standards?: ArtifactReportStandard[];
}): ArtifactReport {
  return {
    kind: 'report',
    title: args.title,
    question: args.question,
    asOf: operatorStamp(args.now),
    scope: args.scope,
    headline: { value: '0', unit: null, label: args.label, hint: 'Nothing matched.' },
    kpis: [],
    sections: [],
    standards: args.standards ?? [],
    notes: [args.note],
    followUps: [],
  };
}

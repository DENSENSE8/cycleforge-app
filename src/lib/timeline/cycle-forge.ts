import type { TimelineItem, TimelineTone } from './types';

/**
 * Normalized `cycle_forge_run_steps` row for the timeline. A subset of the
 * table — the columns the /forge history surface reads.
 */
export interface CycleForgeStepRow {
  id: number;
  stage: string;
  status: string;
  detail: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  architect: 'Architect — design',
  build: 'Build — Grok',
  sync: 'Sync — memory',
  verify: 'Verify — tests',
};

/** step.status → dot tone. running=info, ok=success, failed=danger, skipped=muted. */
const STATUS_TONE: Record<string, TimelineTone> = {
  running: 'info',
  ok: 'success',
  failed: 'danger',
  skipped: 'muted',
};

/**
 * Map `cycle_forge_run_steps` rows → {@link TimelineItem}s for the shared
 * `EventTimeline`, so a forge run renders as a chat-like stage trail using the
 * same timeline language as the rest of the app. Title = the stage label;
 * subtitle carries the stage detail; a muted badge names the raw status.
 */
export function cycleForgeStepsToTimeline(rows: CycleForgeStepRow[]): TimelineItem[] {
  return rows.map((r) => {
    const tone = STATUS_TONE[r.status] ?? 'default';
    return {
      id: `forge-step:${r.id}`,
      at: r.completed_at ?? r.started_at,
      title: STAGE_LABEL[r.stage] ?? r.stage,
      tone,
      subtitle: r.detail && r.detail.trim().length ? r.detail : undefined,
      badges: [{ label: r.status, tone }],
      sourceEventType: r.stage,
    };
  });
}

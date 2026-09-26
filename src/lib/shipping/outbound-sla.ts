/** Pure, exact-deadline display facts for the mobile outbound roster. */

type OutboundSlaTone = 'neutral' | 'warning' | 'danger';

interface OutboundSlaCountdown {
  label: string;
  tone: OutboundSlaTone;
  exact: boolean;
}

function isExactTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value);
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

/**
 * Date-only ship-by values deliberately do not become a fabricated SLA time.
 * The roster calls this with the work-assignment deadline, when available.
 */
export function resolveOutboundSlaCountdown(
  deadlineAt: string | null | undefined,
  nowMs: number = Date.now(),
): OutboundSlaCountdown {
  const raw = String(deadlineAt ?? '').trim();
  if (!raw || !isExactTimestamp(raw)) {
    return { label: 'No SLA assigned', tone: 'neutral', exact: false };
  }
  const deadlineMs = Date.parse(raw);
  if (!Number.isFinite(deadlineMs)) {
    return { label: 'No SLA assigned', tone: 'neutral', exact: false };
  }
  const minutes = Math.max(0, Math.ceil(Math.abs(deadlineMs - nowMs) / 60_000));
  if (deadlineMs <= nowMs) return { label: `Late ${durationLabel(minutes)}`, tone: 'danger', exact: true };
  if (minutes < 15) return { label: `${durationLabel(minutes)} remaining`, tone: 'danger', exact: true };
  if (minutes < 60) return { label: `${durationLabel(minutes)} remaining`, tone: 'warning', exact: true };
  return { label: `${durationLabel(minutes)} remaining`, tone: 'neutral', exact: true };
}

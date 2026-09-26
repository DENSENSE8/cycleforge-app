/** Master-plan MDX → render segments (ALP-3.2). */

import { scanTicketStatuses, parseTicketStatus, type TicketStatus } from './ticket-status';

interface MarkdownSegment {
  kind: 'markdown';
  text: string;
}

interface TicketSegment {
  kind: 'ticket';
  ticketId: string;
  status: TicketStatus | null;
  rawStatus: string;
  href?: string;
  resolutionCommit?: string;
}

interface AgentLogSegment {
  kind: 'agent-log';
  runUid: string;
  stage?: string;
}

type MasterPlanSegment = MarkdownSegment | TicketSegment | AgentLogSegment;

const AGENT_LOG_RE = /<AgentLog\b([^>]*?)\/?>/g;
const ATTR_RE = /([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g;
/** Leading MDX comment block ({/* … *\/}) — metadata, not content. */
const MDX_COMMENT_RE = /\{\/\*[\s\S]*?\*\/\}/g;

function attrsOf(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(ATTR_RE)) out[m[1]] = m[2];
  return out;
}

export function parseMasterPlanSegments(mdx: string): MasterPlanSegment[] {
  const cleaned = mdx.replace(MDX_COMMENT_RE, '');

  // Collect every component tag with its span, then walk in order.
  const tags: Array<{ start: number; end: number; segment: MasterPlanSegment }> = [];

  for (const t of scanTicketStatuses(cleaned)) {
    tags.push({
      start: t.start,
      end: t.end,
      segment: {
        kind: 'ticket',
        ticketId: t.ticketId,
        status: parseTicketStatus(t.rawStatus),
        rawStatus: t.rawStatus,
        href: t.href,
        resolutionCommit: t.resolutionCommit,
      },
    });
  }
  for (const m of cleaned.matchAll(AGENT_LOG_RE)) {
    const attrs = attrsOf(m[1] ?? '');
    if (!attrs.runUid) continue;
    tags.push({
      start: m.index,
      end: m.index + m[0].length,
      segment: { kind: 'agent-log', runUid: attrs.runUid, stage: attrs.stage || undefined },
    });
  }
  tags.sort((a, b) => a.start - b.start);

  const segments: MasterPlanSegment[] = [];
  let cursor = 0;
  for (const tag of tags) {
    const before = cleaned.slice(cursor, tag.start);
    if (before.trim().length > 0) segments.push({ kind: 'markdown', text: before });
    segments.push(tag.segment);
    cursor = tag.end;
  }
  const tail = cleaned.slice(cursor);
  if (tail.trim().length > 0) segments.push({ kind: 'markdown', text: tail });
  return segments;
}

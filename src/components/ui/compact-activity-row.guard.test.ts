/**
 * Source guard: compact two-row activity face.
 *
 * Anatomy: status mark · title · one fact · short age (`4h` via
 * `formatLaneAgeCompact`). Golden host = station recent rails (`RailRow` →
 * `CompactActivityRow` + `RailRowBody`). Portable host = GlobalHeader inbox.
 *
 * Distinct from `StackedRowIdentity` (title → typed CopyChip keys).
 *
 * SoT: CompactActivityRow · RailRowBody · formatLaneAgeCompact
 * Detail: .claude/rules/source-of-truth.md → Compact activity row
 *
 * Run: node --test --import tsx \
 *        src/components/ui/compact-activity-row.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const SOT = read('../../../.claude/rules/source-of-truth.md');
const AGENTS = read('../../../AGENTS.md');
const PRIMITIVE = code(read('./CompactActivityRow.tsx'));
const RAIL_ROW = code(read('../sidebar/rail-shell/RailRow.tsx'));
const RAIL_BODY = code(read('../sidebar/rail-shell/RailRowBody.tsx'));
const INBOX = code(read('../quick-access/ActivityInboxPopover.tsx'));
const DATE = code(read('../../utils/date.ts'));

describe('Compact activity row SoT', () => {
  it('source-of-truth + AGENTS name the primitive and compact age law', () => {
    assert.match(SOT, /Compact activity row|CompactActivityRow/);
    assert.match(SOT, /formatLaneAgeCompact/);
    assert.match(AGENTS, /CompactActivityRow|compact activity row/i);
  });

  it('primitive owns leading mark · children · formatLaneAgeCompact age', () => {
    assert.match(PRIMITIVE, /export function CompactActivityRow/);
    assert.match(PRIMITIVE, /data-compact-activity-row/);
    assert.match(PRIMITIVE, /data-compact-activity-age/);
    assert.match(PRIMITIVE, /formatLaneAgeCompact/);
    assert.match(PRIMITIVE, /SIDEBAR_RAIL_DOT_TRACK/);
    assert.match(PRIMITIVE, /SIDEBAR_RAIL_TRAILING_TRACK_CLASS/);
    assert.match(PRIMITIVE, /SIDEBAR_SCAN_DOCK_LEADING_ROW/);
    assert.doesNotMatch(
      PRIMITIVE,
      /formatDistanceToNow|hrs ago|hours ago/,
      'age must stay compact (4h), never prose relative',
    );
  });

  it('formatLaneAgeCompact remains the compact age SoT (4h / 30m / 3d)', () => {
    assert.match(DATE, /export function formatLaneAgeCompact/);
    assert.match(DATE, /return `\$\{hours\}h`/);
    assert.match(DATE, /return `\$\{mins\}m`/);
    assert.match(DATE, /return `\$\{days\}d`/);
  });

  it('RailRow (golden) composes CompactActivityRow — no local age twin', () => {
    assert.match(RAIL_ROW, /CompactActivityRow/);
    assert.doesNotMatch(
      RAIL_ROW,
      /railRelativeTime|formatLaneAgeCompact|formatDistanceToNow/,
      'RailRow must not format age locally — CompactActivityRow owns the trailing stamp',
    );
    assert.doesNotMatch(
      RAIL_ROW,
      /SIDEBAR_RAIL_TRAILING_TRACK_CLASS/,
      'trailing age track lives in CompactActivityRow',
    );
  });

  it('RailRowBody stays the content stack (no leading mark / age)', () => {
    assert.match(RAIL_BODY, /export function RailRowBody/);
    assert.doesNotMatch(RAIL_BODY, /formatLaneAgeCompact|data-compact-activity-age/);
    assert.doesNotMatch(RAIL_BODY, /SIDEBAR_RAIL_DOT_TRACK/);
  });

  it('header inbox composes CompactActivityRow + RailRowBody', () => {
    assert.match(INBOX, /CompactActivityRow/);
    assert.match(INBOX, /RailRowBody/);
    assert.match(INBOX, /activityAt=\{it\.createdAt\}/);
  });

  it('header inbox bans the chat-notification twin (glyph · hrs ago · pill parade)', () => {
    assert.doesNotMatch(
      INBOX,
      /formatDistanceToNow|inboxRelativeTime|hrs ago|hours ago/,
      'inbox must not invent a prose relative age',
    );
    // Tech-queue identity uses house OrderIdChip / TrackingChip (last-8) via
    // joinStackedIdentityKeys — not mono `Ready · ${id}` prose.
    assert.match(
      INBOX,
      /joinStackedIdentityKeys/,
      'ready/return identity keys join through the stacked-identity SoT helper',
    );
    assert.match(
      INBOX,
      /OrderIdChip/,
      'ready/return rows compose OrderIdChip for order identity',
    );
    assert.match(
      INBOX,
      /TrackingChip/,
      'ready/return rows compose TrackingChip for carrier tracking',
    );
    assert.match(
      INBOX,
      /usePlatformMeta|platformLabel/,
      'OrderIdChip must resolve catalog platform label for hover + glyph tone',
    );
    assert.match(
      INBOX,
      /platformMetaIconTone/,
      'OrderIdChip glyph tone comes from platformMetaIconTone',
    );
    assert.doesNotMatch(
      INBOX,
      /KIND_META|Icon = meta\.Icon|\bTruck\b|\bWrench\b/,
      'leading mark is a status dot, never a large kind glyph',
    );
    // Soft radius pill parade was the bad meta row.
    assert.doesNotMatch(
      INBOX,
      /rounded-full px-1\.5|function Pill\b/,
      'meta is Check + typed chips or one prose fact — not a tone-pill parade',
    );
  });
});

'use client';

/**
 * LEFT RAIL — SESSIONS (renamed from Pages, 2026-08-24 operator ruling).
 * 40px collapsed, 208px expanded, INSTANTLY: a rail that tweens its width
 * holds the well hostage for the length of the tween and hands back nothing
 * during it.
 *
 * Order is meaningful — add · pins · label · tabs · recents. A pin is
 * always-there; a tab is currently-open. Both rails run the same gradient:
 * PERMANENCE DECREASES DOWNWARD.
 *
 * FULLY CLOSEABLE (2026-08-24, operator ruling — parity with the right
 * rail, amends R1). `shell.leftRailOpen` PINS it open or closed; the
 * header's top-left button is the click path and always works. This
 * component adds a hover hot-zone at the viewport's left edge
 * (`useRailPeek`) that PEEKS it open without pinning — a preview, never
 * the only way in, so a `(hover: none)` tablet is unaffected.
 */

import { Icon } from '@/shell/icons';
import { RECENT_KINDS, type RecentEntry } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';
import { useRailPeek } from '@/shell/useRailPeek';

/**
 * RECENTS — scoped to the CURRENT SESSION (2026-08-24 ruling; H1's "per
 * staff, per org, never per session" is struck through in LAWS.md). Only
 * rows tagged to the armed block's own ref render; park that block and the
 * trail clears with it — the next session starts on a clean list, and a
 * parked session is resumed from its own "Resume" control in the well, not
 * bookmarked here.
 */
function Recents({ shell }: { shell: ShellApi }) {
  const currentSessionRef = shell.armedBlock?.ref ?? null;
  const scoped = currentSessionRef
    ? shell.recents.filter((r) => r.sessionId === currentSessionRef)
    : [];
  const newest = scoped.reduce<RecentEntry | null>(
    (best, r) => (best === null || r.at > best.at ? r : best),
    null,
  );

  return (
    <div className="recents-list">
      {RECENT_KINDS.map((band) => {
        const rows = scoped
          .filter((r) => r.kind === band.kind)
          .sort((a, b) => b.at - a.at)
          .slice(0, band.cap);
        if (rows.length === 0) return null;

        return (
          <div className="recent-band" key={band.kind} data-kind={band.kind}>
            <div className="recent-band-label">{band.label}</div>
            {rows.map((r) => {
              const isLast = newest !== null && r.id === newest.id;
              return (
                <button
                  type="button"
                  key={r.id}
                  className={`recent-item${isLast ? ' is-last' : ''}`}
                  title={`${isLast ? 'Most recent selection · ' : ''}${band.label.replace(/s$/, '')} · ${r.title} — ${r.sub}`}
                  onClick={() => shell.touchRecent(r.id)}
                >
                  <Icon name={band.icon} size={15} />
                  <span className="recent-text">
                    <span className="recent-title">{r.title}</span>
                    <span className="recent-sub">{r.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function RailSessions({ shell }: { shell: ShellApi }) {
  const expanded = shell.leftExpanded;
  const { visible, handleEnter, handleLeave } = useRailPeek(shell.leftRailOpen);

  return (
    <div className="rail-left-zone" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {visible ? (
        <nav className={`rail left${expanded ? ' expanded' : ''}`} aria-label="Sessions">
          <button
            type="button"
            className="rail-btn"
            onClick={() => shell.openLauncher('')}
            title="Add a session or table (Ctrl+K)"
          >
            <Icon name="plus" size={16} />
            <span className="rail-btn-label">Add session or table</span>
          </button>
          <div className="rail-divider" />

          {/* PINNED — above the tabs, and that ordering is the point. */}
          <div className="rail-group">
            {shell.pins.map((pin) => (
              <button
                type="button"
                key={pin.id}
                className="pin"
                title={`${pin.title} — pinned`}
                onClick={() => shell.openTile(pin.id, pin.title, 'table')}
              >
                <Icon name={pin.icon} size={15} />
                <span className="tab-name">{pin.title}</span>
              </button>
            ))}
          </div>

          <div className="rail-divider rail-divider-collapsed" />
          <button
            type="button"
            className="rail-label"
            onClick={shell.toggleLeftRail}
            title="Switch between icon-only and labelled"
          >
            Sessions
          </button>

          <div className="tab-list">
            {shell.tabs.map((tab) => (
              <button
                type="button"
                key={tab.ref}
                className={`tab${tab.ref === shell.activeRef ? ' active' : ''}`}
                title={tab.title}
                onClick={() => shell.focusRef(tab.ref)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const tile = shell.tiles.find((t) => t.ref === tab.ref);
                  shell.setContextMenu({ x: e.clientX, y: e.clientY, tileId: tile?.id ?? null });
                }}
              >
                <Icon name={tab.icon} size={15} />
                <span className="tab-name">{tab.title}</span>
                {tab.color ? <span className="tab-color" style={{ background: tab.color }} /> : null}
              </button>
            ))}
          </div>

          {/* No slack, no gap — `.tab-list` is a `flex: 0 1 auto` strip, so
              with no tabs open the rail sits tight: pins, then Recents, no
              empty flex-filled void between them. `.rail-label` above is
              the rail's icon/label control now; the header's top-left
              button is the open/close one. */}
          <div className="rail-divider" />
          <div className="recents-header" title="Recents — this session's own trail. Banded by kind; the tint marks your most recent selection.">
            <span className="recents-icon">
              <Icon name="history" size={15} />
            </span>
            <span>Recents</span>
          </div>
          <Recents shell={shell} />
        </nav>
      ) : null}
    </div>
  );
}

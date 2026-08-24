'use client';

/**
 * The three floating surfaces and the one banner, all of which are defined by
 * a 1–2px stroke alone: with no radius and no elevation there is nothing else
 * to separate one surface from the next.
 *
 * Each appears and disappears INSTANTLY. Nothing here animates geometry.
 */

import { Icon } from '@/shell/icons';
import { hhmmss, useClock } from '@/shell/clock';
import type { ShellApi } from '@/shell/useShell';

/** In the beam's flow band, not floating. */
export function OfflineBanner({ shell }: { shell: ShellApi }) {
  return (
    <div className={`offline-banner${shell.offline ? ' open' : ''}`} role="status">
      <Icon name="wifi-off" size={12} />
      <span>Offline — changes queued locally</span>
    </div>
  );
}

export function ContextMenu({ shell }: { shell: ShellApi }) {
  const menu = shell.contextMenu;
  if (!menu) return null;

  const close = () => shell.setContextMenu(null);
  const tileId = menu.tileId;

  return (
    <div
      className="context-menu open"
      style={{
        left: Math.min(menu.x, typeof window === 'undefined' ? menu.x : window.innerWidth - 200),
        top: Math.min(menu.y, typeof window === 'undefined' ? menu.y : window.innerHeight - 180),
      }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      <button
        type="button"
        className="context-item"
        role="menuitem"
        onClick={() => {
          if (tileId) {
            const tile = shell.tiles.find((t) => t.id === tileId);
            // The prototype renames through `prompt`. Replacing it with the
            // in-place editor the session title already uses is a followUp,
            // not a redesign to make here.
            const next = tile ? window.prompt('Rename tab:', tile.title) : null;
            if (next) shell.renameTile(tileId, next);
          }
          close();
        }}
      >
        <Icon name="edit" size={14} /> Rename
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        onClick={() => {
          if (tileId) shell.cycleTileIcon(tileId);
          close();
        }}
      >
        <Icon name="box" size={14} /> Change icon
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        onClick={() => {
          if (tileId) shell.cycleTileColor(tileId);
          close();
        }}
      >
        <Icon name="palette" size={14} /> Change color
      </button>
      <div className="context-divider" />
      <button
        type="button"
        className="context-item danger"
        role="menuitem"
        onClick={() => {
          if (tileId) shell.closeTile(tileId);
          close();
        }}
      >
        <Icon name="trash" size={14} /> Close
      </button>
    </div>
  );
}

export function SessionPopover({ shell }: { shell: ShellApi }) {
  const clock = useClock();
  return (
    <div
      className={`session-popover${shell.sessionPopoverOpen ? ' open' : ''}`}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="session-popover-header">
        <span>Session</span>
        <button
          type="button"
          className="rail-btn rail-btn-sm"
          title="Close"
          onClick={() => shell.setSessionPopoverOpen(false)}
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="session-popover-body">
        <div className="session-field">
          <label htmlFor="session-name">Session name</label>
          <input
            id="session-name"
            type="text"
            value={shell.sessionName}
            onChange={(e) => shell.setSessionName(e.target.value)}
          />
        </div>
        <div className="session-field">
          <label htmlFor="session-type">Type</label>
          <input id="session-type" className="readonly" type="text" readOnly value="scan — packing" />
        </div>
        <div className="session-field">
          <label htmlFor="session-started">Elapsed</label>
          <input id="session-started" className="readonly" type="text" readOnly value={hhmmss(clock.elapsed)} />
        </div>
        <div className="session-popover-actions">
          <button type="button" className="btn btn-sm" onClick={shell.parkSession}>
            Park session
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={shell.endSession}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * SETTINGS — the bottom-left corner's one panel. Theme lives here (a palette
 * swap is a preference, not a floor control), and so does a second way to
 * expand either rail, for an operator who found the preference before they
 * found the rail edge.
 */
export function SettingsPopover({ shell }: { shell: ShellApi }) {
  return (
    <div
      className={`settings-popover${shell.settingsPopoverOpen ? ' open' : ''}`}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="session-popover-header">
        <span>Settings</span>
        <button
          type="button"
          className="rail-btn rail-btn-sm"
          title="Close settings"
          onClick={() => shell.setSettingsPopoverOpen(false)}
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="session-popover-body">
        <div className="session-field">
          <span className="settings-field-label">Theme</span>
          <div className="mode-toggle">
            <button
              type="button"
              className={shell.theme === 'light' ? 'active' : undefined}
              aria-pressed={shell.theme === 'light'}
              onClick={() => shell.setTheme('light')}
            >
              light
            </button>
            <button
              type="button"
              className={shell.theme === 'dark' ? 'active' : undefined}
              aria-pressed={shell.theme === 'dark'}
              onClick={() => shell.setTheme('dark')}
            >
              dark
            </button>
          </div>
        </div>
        <div className="session-field">
          <span className="settings-field-label">Rails</span>
          <div className="mode-toggle">
            <button
              type="button"
              className={shell.leftExpanded ? 'active' : undefined}
              aria-pressed={shell.leftExpanded}
              onClick={shell.toggleLeftRail}
            >
              sessions
            </button>
            <button
              type="button"
              className={shell.rightExpanded ? 'active' : undefined}
              aria-pressed={shell.rightExpanded}
              onClick={shell.toggleRightRail}
            >
              tools
            </button>
          </div>
        </div>
        <div className="settings-note">
          An expanded rail shows every icon with its label. The rail&apos;s inner edge, its empty
          slack and the vertical PAGES / TOOLS label all do the same thing.
        </div>
      </div>
    </div>
  );
}

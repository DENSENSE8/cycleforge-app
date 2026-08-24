'use client';

/**
 * THE LAUNCHER — the one index. There is no second "+".
 *
 * `Ctrl+K` (S12 gave ⌘N to the session block); the scan field also opens it in place once two
 * characters are typed, without parking the session. ↑/↓ move across grouped
 * results, Enter runs, Escape closes, and the selected row carries a 3px
 * accent edge and a `↵` marker.
 *
 * The work QUEUES live here now, not in a rail. A queue is a table: it wants
 * width, columns, sort and virtualization, none of which a 208px strip can
 * give it. Every entry in the Tables group was a sidebar rail.
 *
 * NO EXACT MATCH IS NOT A DEAD END — it is the orchestration case. The
 * launcher is already the one "tell me what you want" surface, so natural
 * language belongs HERE, not behind a second input.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '@/shell/icons';
import type { ShellApi } from '@/shell/useShell';

interface LauncherItem {
  readonly title: string;
  readonly meta: string;
  readonly icon: IconName;
  readonly run: () => void;
}

interface LauncherGroup {
  readonly label: string;
  readonly items: readonly LauncherItem[];
}

function buildGroups(shell: ShellApi): readonly LauncherGroup[] {
  const t = (ref: string, title: string) => () => shell.openTile(ref, title, 'table');
  const s = (ref: string, title: string) => () => shell.openTile(ref, title, 'session');

  return [
    {
      label: 'Sessions',
      items: [
        { title: 'Unbox session', meta: 'Start receiving cartons', icon: 'box', run: s('unbox', 'Unbox') },
        { title: 'Packing session', meta: 'Pack graded units', icon: 'box', run: s('packing', 'Packing') },
        { title: 'QC session', meta: 'Quality control', icon: 'box', run: s('qc', 'QC') },
        {
          title: 'FBA shipment build',
          meta: 'Task session · the unit of work is the BATCH',
          icon: 'box',
          run: s('fba-build', 'FBA shipment'),
        },
      ],
    },
    {
      label: 'Tables',
      items: [
        { title: 'Triage queue', meta: 'Was: receiving triage rail', icon: 'table', run: t('triage', 'Triage') },
        { title: 'Receiving feed', meta: 'Was: unbox recent rail', icon: 'table', run: t('receiving', 'Receiving') },
        { title: 'Pickup queue', meta: 'Was: pickup sidebar rail', icon: 'table', run: t('pickup', 'Pickup') },
        { title: 'Label prints', meta: 'Was: product-labels rail', icon: 'table', run: t('labels', 'Labels') },
        {
          title: 'Settings',
          meta: 'A tile like everything else · arrangement · comfort · meaning',
          icon: 'settings',
          run: t('settings', 'Settings'),
        },
        { title: 'Units', meta: 'All inventory units', icon: 'table', run: t('units', 'Units') },
        { title: 'Orders', meta: 'Open orders', icon: 'table', run: t('orders', 'Orders') },
        { title: 'Returns', meta: 'Return merchandise', icon: 'table', run: t('returns', 'Returns') },
      ],
    },
    {
      label: 'Tools',
      items: [
        { title: 'Pairing', meta: 'TRK# to serial', icon: 'split', run: () => shell.toggleTool('pairing') },
        { title: 'Timer', meta: 'Session elapsed time', icon: 'timer', run: () => shell.toggleTool('timer') },
        { title: 'Stopwatch', meta: 'Lap timing', icon: 'stopwatch', run: () => shell.toggleTool('stopwatch') },
        { title: 'Photo library', meta: 'Unit photos', icon: 'image', run: () => shell.toggleTool('photos') },
        { title: 'Manuals', meta: 'Product documentation', icon: 'book', run: () => shell.toggleTool('manuals') },
        { title: 'Label printer', meta: 'Print shipping labels', icon: 'printer', run: () => shell.toggleTool('printer') },
        { title: 'Calculator', meta: 'Quick math', icon: 'calc', run: () => shell.toggleTool('calc') },
      ],
    },
    {
      label: 'Admin',
      items: [
        { title: 'Toggle theme', meta: 'Light / dark', icon: 'palette', run: shell.toggleTheme },
        { title: 'Header readout — pace', meta: 'Elapsed + target, coloured', icon: 'timer', run: () => shell.setFaceMode('pace') },
        { title: 'Header readout — elapsed only', meta: 'The clock, never a verdict', icon: 'timer', run: () => shell.setFaceMode('elapsed') },
        { title: 'Header readout — off', meta: 'Hide it. Work is still recorded', icon: 'timer', run: () => shell.setFaceMode('off') },
        { title: 'Simulate offline', meta: 'Show the queued-changes banner', icon: 'wifi-off', run: shell.toggleOffline },
      ],
    },
  ];
}

export function Launcher({ shell }: { shell: ShellApi }) {
  const open = shell.launcherQuery !== null;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const selected = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(shell.launcherQuery ?? '');
    setIndex(0);
    input.current?.focus();
  }, [open, shell.launcherQuery]);

  const groups = useMemo(() => buildGroups(shell), [shell]);

  const { visible, flat } = useMemo(() => {
    const q = query.toLowerCase().trim();
    const vis: LauncherGroup[] = [];
    const list: LauncherItem[] = [];
    for (const group of groups) {
      const items = group.items.filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.meta.toLowerCase().includes(q) ||
          group.label.toLowerCase().includes(q),
      );
      if (items.length === 0) continue;
      vis.push({ label: group.label, items });
      list.push(...items);
    }
    if (list.length === 0 && q) {
      const ask: LauncherItem = {
        title: 'Ask the assistant',
        meta: `“${query}” — no exact match`,
        icon: 'assistant',
        run: () => shell.toggleTool('ai'),
      };
      vis.push({ label: 'Assistant', items: [ask] });
      list.push(ask);
    }
    return { visible: vis, flat: list };
  }, [groups, query, shell]);

  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const run = (item: LauncherItem | undefined) => {
    if (!item) return;
    item.run();
    shell.closeLauncher();
  };

  let cursor = -1;

  return (
    <div className="launcher open" onClick={shell.closeLauncher} role="presentation">
      <div className="launcher-box" onClick={(e) => e.stopPropagation()} role="presentation">
        <input
          ref={input}
          type="text"
          className="launcher-input"
          autoComplete="off"
          aria-label="Search sessions, tables, tools"
          placeholder="Search sessions, tables, tools…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (flat.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => (i + 1) % flat.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => (i - 1 + flat.length) % flat.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(flat[index]);
            }
          }}
        />
        <div className="launcher-results">
          {visible.length === 0 ? (
            <div className="tool-empty">Type to search</div>
          ) : (
            visible.map((group) => (
              <div className="launcher-group" key={group.label}>
                <div className="launcher-group-label">{group.label}</div>
                {group.items.map((item) => {
                  cursor += 1;
                  const i = cursor;
                  const isSelected = i === index;
                  return (
                    <button
                      type="button"
                      key={`${group.label}:${item.title}`}
                      ref={isSelected ? selected : undefined}
                      className={`launcher-item${isSelected ? ' selected' : ''}`}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => run(item)}
                    >
                      <div className="launcher-item-icon">
                        <Icon name={item.icon} size={13} />
                      </div>
                      <div>
                        <div className="launcher-item-title">{item.title}</div>
                        <div className="launcher-item-meta">{item.meta}</div>
                      </div>
                      {isSelected ? <span className="launcher-item-kbd">↵</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * The ⌘K palette's navigation when nothing is typed — read from the SAME
 * contract the contextual sidebar paints (`GET /api/nav/context`), so the
 * palette and the sidebar can never disagree about what a page is called,
 * which lane door it sits behind, or its order (org rename / hide included):
 *
 * - "This page" group (a page with a panel): its views (each with its
 *   sidebar glyph) then its verbs (Chat's New chat, Shipping's Sync…). A
 *   verb's chord (`hotkey`) shows on the selected row only.
 * - The page map (`view=top`): top rows, one door per lane, Scan Stations
 *   last under their own heading — hairline where the sidebar has one; the
 *   current page lit. Lane doors open the staffer's last view.
 *
 * A typed query keeps the palette's own destination matcher, which also
 * finds the pages a lane door hides (FBA, Label intake).
 */

import { useSyncExternalStore } from 'react';
import type { NavAction, NavContext, NavItem, NavSection } from '@/lib/nav/context/schema';
import { getNavIntentsVersion, hasNavIntent, subscribeNavIntents } from '@/lib/nav/intents';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { navRowGlyph, type Glyph } from '@/components/sidebar/contextual/NavSectionList';
import { NAV_ACTION_ICONS } from '@/components/sidebar/contextual/nav-view-icons';
import { isNavModeSection } from '@/components/sidebar/contextual/NavModeSwitcher';
import { useLaneDoorHref } from '@/components/sidebar/contextual/useLaneDoorHref';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';
import { cn } from '@/utils/_cn';

export function CommandBarPageMap({
  onHref,
  onIntent,
}: {
  /** Close the palette, then navigate. */
  onHref: (href: string) => void;
  /** Close the palette, then run the page's verb. */
  onIntent: (intent: string) => void;
}) {
  const path = useCurrentNavPath();
  const page = useNavContext(path).data;
  const map = useNavContext(path, { view: 'top' }).data;
  const doorHref = useLaneDoorHref();
  useSyncExternalStore(subscribeNavIntents, getNavIntentsVersion, () => 0);

  const hasPanel = page?.scope === 'section';
  const views = hasPanel ? page.sections.filter((section) => !isNavModeSection(section)).flatMap((s) => s.items) : [];
  const verbs = (hasPanel ? (page.actions ?? []) : []).filter(
    (action) => action.href !== undefined || (action.intent !== undefined && hasNavIntent(action.intent)),
  );

  return (
    <>
      {page && (verbs.length > 0 || views.length > 0) ? (
        <CommandGroup heading={page.page.label} data-command-this-page>
          {views.map((item) => (
            <PageItem
              key={`view:${item.id}`}
              value={`view ${page.page.label} ${item.label}`}
              item={item}
              glyph={navRowGlyph(item, page.page.id)}
              onSelect={() => onHref(item.href)}
            />
          ))}
          {verbs.map((action) => (
            <VerbItem key={`verb:${action.id}`} action={action} onHref={onHref} onIntent={onIntent} />
          ))}
        </CommandGroup>
      ) : null}
      {map ? <MapGroups map={map} doorHref={doorHref} onHref={onHref} /> : null}
    </>
  );
}

/** The page map in the sidebar's grouping: unlabelled runs share a group; a labelled lane gets a hairline and its name. */
function MapGroups({
  map,
  doorHref,
  onHref,
}: {
  map: NavContext;
  doorHref: (pageId: string) => string | null;
  onHref: (href: string) => void;
}) {
  const runs: Array<{ label?: string; sections: NavSection[] }> = [];
  for (const section of map.sections) {
    if (section.items.length === 0) continue;
    const last = runs.at(-1);
    if (!section.label && last && !last.label) last.sections.push(section);
    else runs.push({ label: section.label, sections: [section] });
  }
  return (
    <>
      {runs.map((run, index) => (
        <div key={run.sections[0]!.id} className="contents">
          {index > 0 ? <CommandSeparator className="mx-2 my-1 bg-border-hairline" /> : null}
          <CommandGroup heading={run.label ?? (index === 0 ? 'Go to' : undefined)} data-command-page-map>
            {run.sections.flatMap((section) =>
              section.items.map((item) => (
                <PageItem
                  key={`page:${item.id}`}
                  value={`page ${item.label} ${item.href}`}
                  item={item}
                  glyph={navRowGlyph(item, undefined)}
                  onSelect={() => onHref(doorHref(item.id) ?? item.href)}
                />
              )),
            )}
          </CommandGroup>
        </div>
      ))}
    </>
  );
}

function GlyphMark({ glyph }: { glyph: Glyph | null }) {
  if (!glyph) return <span aria-hidden className="size-4 shrink-0" />;
  return <glyph.icon className={navIconStrokeClass(cn('size-4 shrink-0', glyph.tone))} />;
}

function PageItem({
  value,
  item,
  glyph,
  onSelect,
}: {
  value: string;
  item: NavItem;
  glyph: Glyph | null;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} aria-current={item.active ? 'page' : undefined}>
      <GlyphMark glyph={glyph} />
      <span className={cn('min-w-0 flex-1 truncate', item.active && 'font-medium')}>{item.label}</span>
      {item.active ? <span className="shrink-0 text-role-caption text-text-faint">Current</span> : null}
    </CommandItem>
  );
}

function VerbItem({
  action,
  onHref,
  onIntent,
}: {
  action: NavAction;
  onHref: (href: string) => void;
  onIntent: (intent: string) => void;
}) {
  const apple = useApplePlatform();
  const glyph = NAV_ACTION_ICONS[action.id] ?? null;
  const shortcut = action.hotkey ? chordKeys(action.hotkey, apple).join(' + ') : undefined;
  return (
    <HoverTooltip label={action.label} shortcut={shortcut} disabled={!shortcut} asChild>
      <CommandItem
        value={`verb ${action.label}`}
        onSelect={() => {
          if (action.intent) onIntent(action.intent);
          else if (action.href) onHref(action.href);
        }}
      >
        <GlyphMark glyph={glyph} />
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
      </CommandItem>
    </HoverTooltip>
  );
}

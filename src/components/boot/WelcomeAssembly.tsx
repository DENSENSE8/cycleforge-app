'use client';

/**
 * WelcomeAssembly — the post-sign-in welcome overlay, drawn OVER the live page.
 *
 * WelcomeHost (shell-mounted, every desktop route) plays this over the live
 * page, so nothing here is a mock: the overlay only veils and unveils real regions.
 * The lobby is THEMED (welcome-theme.ts: palette transform, ambient shapes,
 * particles, glyph variant, greeting) — resolved once per mount on the PST
 * calendar (`?welcomeTheme=` outside production); every theme runs the same
 * code path. Every timing is a token of welcome/motion-grammar.ts.
 * Four phases, each starting only after the previous one settles:
 *   1. Greeting — a soft lobby tinted from the staffer's own colour (the
 *      theme's AmbientLayer behind a frosted aluminium card): their avatar in
 *      a staff-colour ring, settling in, and "{greeting}, {name}" entering
 *      glyph by glyph (SplitText, the theme's variant), the name as polished
 *      metal; a soft line — the weekday, plus the real open count once the
 *      Daily queries have it. Hold. Then the NAME leaves first — ", {name}"
 *      glyphs exit in reverse — and the card narrows to the greeting (a
 *      width FLIP, contents and radius counter-scaled). Then the card
 *      TRAVELS centre → top-left onto the real search field
 *      (NavFind's well — the sidebar's top row when the column is
 *      open, the header's when it is closed; a closed column's collapsed
 *      stub is never a target): a manual FLIP (x / y / scaleX / scaleY on
 *      `travel(distance)`, radius → 0 on `handoff`). Its contents fade on
 *      `exit` from the first frame and are counter-scaled to a UNIFORM
 *      scale, so text never squashes while the empty shape morphs; then the
 *      card dissolves onto the real control. No search on screen → the card
 *      collapses into the header box instead.
 *   2–4. Header → sidebar → main. ONE spotlight — it starts as the avatar's
 *      ring and leaves it as the card starts travelling, riding along to the
 *      header — glides region to region on `move`, its radius adapting to each
 *      (a pill on the header, a rounded rect on the sidebar, on the agenda).
 *      Each region's veil fades back into a rounded inset as its readiness
 *      fires, never before the card has landed. A closed / absent sidebar is
 *      logged and skipped with no dead gap. Main opens on the focus region
 *      first (on Daily, the agenda: the real open count via AnimateNumber +
 *      today's checklist ring, both from the React Query cache), holds, then
 *      the rest of main unveils.
 * The focus region is discovered, never passed in: the first
 * `[data-welcome-focus="<label>"]` inside `<main>`, ready on its
 * `data-welcome-focus-mark` `cf-paint-mark` surface (no mark attribute: once
 * it has content). No such element → `<main>` itself is the focus.
 * Each phase starts at max(its scheduled time, its region's real readiness),
 * scheduled a lead after the previous phase SETTLES — its veil starting to
 * lift, so a lifting veil never holds the next region back. Readiness:
 * header / sidebar / main on DOM presence, main additionally on the focus
 * region's readiness. Real arrivals — regions, React Query keys as they
 * settle (with real counts), paint marks, landings — float up as soft chips.
 * When main settles the ambient layer leaves, the spotlight dissolves and the
 * overlay leaves the workspace flush; PHASE.HARD_CAP ends it regardless.
 * Reduced motion: whole-string crossfades (no per-glyph motion), no travel
 * (the card fades), no glide, shapes still and particles off — every piece
 * crossfades.
 *
 * Any key (not a bare modifier, not a repeat) or a pointer-down skips straight
 * to the end; the skipping key is swallowed so the page underneath does not
 * also act on it. `onExited` fires exactly once per mount; replay
 * is a remount with a new key.
 *
 * The resting greeting frame (classes + markup) is shared with WelcomeBridge
 * (/signin) and BOOT_SPLASH_SCRIPT (pre-hydration) via
 * src/lib/boot-splash-script.ts; materials and the staff palette live in the
 * `cf-welcome-*` block of src/app/globals.css.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { AnimatePresence, animate, motion, useReducedMotion, type Transition, type Variants } from 'motion/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { AnimateNumber } from '@/design-system/motion/plus';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { taskDeskQueryOptions } from '@/features/tasks/useTaskDesk';
import { AmbientLayer } from '@/components/boot/welcome/AmbientLayer';
import {
  PHASE,
  exit,
  glint,
  handoff,
  instant,
  move,
  ms,
  recede,
  reducedMotion,
  settle as settleSpring,
  skipHint,
  travel,
  veilLift,
  colorTween,
} from '@/components/boot/welcome/motion-grammar';
import { SplitText, countGlyphs } from '@/components/boot/welcome/split-text';
import { resolveWelcomeTheme, welcomePaletteStyle, type WelcomeTheme } from '@/components/boot/welcome/welcome-theme';
import {
  WELCOME_AVATAR_SLOT_CLASS,
  WELCOME_CARD_CLASS,
  WELCOME_CARD_GRAIN_CLASS,
  WELCOME_COLUMN_CLASS,
  WELCOME_FROST_CLASS,
  WELCOME_GLINT_CLIP_CLASS,
  WELCOME_GROUND_CLASS,
  WELCOME_GROUND_GRAIN_CLASS,
  WELCOME_HEADLINE_CLASS,
  WELCOME_NAME_GLOW_CLASS,
  WELCOME_NAME_INK_CLASS,
  WELCOME_ROOT_CLASS,
  WELCOME_SOFT_LINE_CLASS,
  WELCOME_STAGE_CLASS,
  WELCOME_TAIL_SEPARATOR,
  welcomeStatusText,
  welcomeWeekday,
} from '@/lib/boot-splash-script';
import { readWelcomeThemeOverride } from '@/lib/boot-flag';
import { dailyChecksQueryOptions } from '@/lib/daily-checks/use-daily-checks';
import { readPaintMarks } from '@/lib/observability/paint-timing';
import { paintMarkId } from '@/lib/observability/tier1-paint-order';
import { qk } from '@/queries/keys';
import { cn } from '@/utils/_cn';
import { getCurrentPSTDateKey } from '@/utils/date';
import { getStaffColorHex, setStaffColorHex } from '@/utils/staff-colors';

// ─── Timing (all from the motion grammar — tune there) ─────────────────────

/** Wait after the PREVIOUS phase settles before a region phase may start (it also waits on the region's readiness). */
const PHASE_LEAD_MS: Readonly<Record<PhaseId, number>> = {
  header: ms(PHASE.REGION_LEAD),
  sidebar: ms(PHASE.REGION_LEAD),
  main: ms(PHASE.MAIN_LEAD),
};
/**
 * The overlay's own `exit` fade fills the tail of the END beat: the spotlight has dissolved (on `exit`, from the
 * beat's start) before the overlay starts to go, and the overlay is gone just as the ambient shapes finish leaving.
 */
const END_EXIT_AT_MS = ms(PHASE.END) - ms(exit.duration ?? 0);
/** Arrival lines kept; the newest CHIPS_VISIBLE float. */
const LOG_LIMIT = 32;
const CHIPS_VISIBLE = 3;
/** Mirrors StaffColorsProvider's staleTime on the shared roster query (cache freshness, not motion). */
const STAFF_ROSTER_STALE_MS = 5 * 60 * 1000;
/** Bare modifier presses never skip — they are usually the start of a chord. */
const MODIFIER_KEYS: Record<string, true> = { Shift: true, Control: true, Alt: true, Meta: true };

// ─── Spotlight + veil geometry ───────────────────────────────────────────────

/** The spotlight sits this far inside each region. */
const SPOT_INSET_PX: Readonly<Record<PhaseId, number>> = { header: 4, sidebar: 6, main: 6 };
const SIDEBAR_SPOT_RADIUS_PX = 22;
const AGENDA_SPOT_RADIUS_PX = 24;
/** Veils fade back into these rounded insets (header uses a pill: radius = half its inset height). */
const VEIL_INSET_PX: Readonly<Record<PhaseId, number>> = { header: 4, sidebar: 8, main: 10 };
const VEIL_RADIUS_PX = 24;
/** The main veil's window onto the agenda: concentric with the spotlight inside it. */
const FOCUS_WINDOW_RADIUS_PX = AGENDA_SPOT_RADIUS_PX + SPOT_INSET_PX.main;

/**
 * The spotlight's ring — equal to `.cf-welcome-avatar-ring` in globals.css
 * (2px staff colour, a 16% halo, a 20% glow), set inline in hex so Motion can
 * scale-correct it while the spotlight glides. `hex` is `#rrggbb`.
 */
function spotlightShadow(hex: string): string {
  return `0 0 0 2px ${hex}, 0 0 0 7px ${hex}29, 0 0 28px 4px ${hex}33`;
}

// ─── Regions (read-only DOM hooks on the real shell) ─────────────────────────

/** GlobalHeader's zone hooks — its `<header>` is found through them, never a bare landmark (pages carry headers of their own). */
const HEADER_ZONE_SELECTOR = '[data-header-zone]';
/** DesktopRouteShell's nav column host (SidebarNavColumn); `data-open="false"` = no sidebar on screen. */
const SIDEBAR_COLUMN_SELECTOR = '[data-sidebar-nav-column]';
/** SidebarProvider's root — present once the column's contents (contextual panel or page map) have rendered. */
const SIDEBAR_CONTENT_SELECTOR = '[data-slot="sidebar-wrapper"]';
/** NavFind's well (the one search field, either scope): the sidebar's top row, or GlobalHeaderSearch's while the column is closed. */
const SEARCH_WELL_SELECTOR = '[data-nav-search-well]';

/** Region phases, in order. The focus region lives inside `main` and opens within its phase. */
type PhaseId = 'header' | 'sidebar' | 'main';
type RegionId = PhaseId | 'focus';

const PHASES: readonly PhaseId[] = ['header', 'sidebar', 'main'];

/** Arrival-chip names. */
const PHASE_LOG: Readonly<Record<PhaseId, string>> = { header: 'Header', sidebar: 'Sidebar', main: 'Workspace' };

/** The Daily agenda's paint mark — the only focus whose counts this overlay knows how to read. */
const DAILY_FOCUS_MARK = paintMarkId('daily', 'primary');

/** A page opts its primary region in with this attribute (value = arrival-chip label); the first inside `<main>` wins. */
const FOCUS_ATTR = 'data-welcome-focus';
/** Optional: the `cf-paint-mark` surface stamped when the focus region's first real content renders. */
const FOCUS_MARK_ATTR = 'data-welcome-focus-mark';

/** The page's primary region, as discovered — the one the assembly waits on and lights. */
interface WelcomeFocus {
  label: string;
  /** Paint-mark surface; null = ready once the region has content. */
  mark: string | null;
}

interface FocusScan extends WelcomeFocus {
  box: Box | null;
  hasContent: boolean;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LogLine {
  id: number;
  at: number;
  text: string;
}

interface RegionScan {
  box: Box | null;
  /** Presence signal (header / sidebar / main). */
  present: boolean;
  /** Not on screen at all (a closed or unmounted sidebar column). */
  absent: boolean;
}

/** Where the card lands: the real search well and the region it sits in, or (region `null`) the header box. */
interface Landing {
  box: Box;
  region: Exclude<PhaseId, 'main'> | null;
}

/** Where the spotlight is: `key` changes whenever the box does, so Motion re-measures exactly then. */
interface SpotTarget {
  key: string;
  box: Box;
  radius: number;
}

/** Today's checklist for the viewer — the house denominator (`mine.total`), never the org-wide list. */
interface ChecklistProgress {
  done: number;
  total: number;
}

/** `wait` = scheduled, waiting on time + readiness; `lock` = ready under the spotlight; `focus` = the agenda unveiled, holding; `settled` = veil lifting / lifted. */
type Step = 'wait' | 'lock' | 'focus' | 'settled' | 'skipped';
/** greeting (glyphs in + hold) → name-exit (name glyphs out, card narrows) → travel (card → search) → assembly. */
type Stage = 'greeting' | 'name-exit' | 'travel' | 'assembly';

function measure(el: Element | null | undefined): Box | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function scanRegion(id: PhaseId): RegionScan {
  switch (id) {
    case 'header': {
      const box = measure(document.querySelector(HEADER_ZONE_SELECTOR)?.closest('header'));
      return { box, present: box !== null, absent: false };
    }
    case 'main': {
      const main = document.querySelector('main');
      const box = measure(main);
      return { box, present: box !== null && main?.firstElementChild != null, absent: false };
    }
    case 'sidebar': {
      const column = document.querySelector(SIDEBAR_COLUMN_SELECTOR);
      if (!column || column.getAttribute('data-open') === 'false') return { box: null, present: false, absent: true };
      const box = measure(column);
      return { box, present: box !== null && column.querySelector(SIDEBAR_CONTENT_SELECTOR) != null, absent: false };
    }
  }
}

/** The first `[data-welcome-focus]` inside `<main>`, or null (the page has none: `<main>` itself is the focus). */
function scanFocus(): FocusScan | null {
  const el = document.querySelector('main')?.querySelector(`[${FOCUS_ATTR}]`);
  if (!el) return null;
  return {
    label: el.getAttribute(FOCUS_ATTR) || PHASE_LOG.main,
    mark: el.getAttribute(FOCUS_MARK_ATTR) || null,
    box: measure(el),
    hasContent: el.firstElementChild !== null || (el.textContent ?? '').trim() !== '',
  };
}

/** Decided when a phase comes up, from the live DOM: no header chrome / no open sidebar column → skip, never wait. */
function phaseAbsent(id: PhaseId): boolean {
  if (id === 'header') return document.querySelector(HEADER_ZONE_SELECTOR) === null;
  if (id === 'sidebar') return scanRegion('sidebar').absent;
  return false;
}

/** Narrower than this is a collapsed column's icon stub, not a search field. */
const MIN_WELL_WIDTH_PX = 48;

/**
 * The visible search well and the region it sits under — the sidebar's while its column is open, else the header's
 * (a closed column's stub and anything off screen never count); else the header box; else nothing.
 */
function findLanding(): Landing | null {
  const preferred: Landing['region'] = scanRegion('sidebar').absent ? 'header' : 'sidebar';
  let fallback: Landing | null = null;
  const wells = document.querySelectorAll(SEARCH_WELL_SELECTOR);
  for (let i = 0; i < wells.length; i++) {
    const well = wells[i];
    const box = measure(well);
    if (!box || box.width < MIN_WELL_WIDTH_PX) continue;
    if (box.left < 0 || box.top < 0 || box.left + box.width > window.innerWidth) continue;
    const column = well.closest(SIDEBAR_COLUMN_SELECTOR);
    let region: Landing['region'];
    if (column) {
      if (column.getAttribute('data-open') === 'false') continue;
      region = 'sidebar';
    } else if (well.closest('header')?.querySelector(HEADER_ZONE_SELECTOR)) {
      region = 'header';
    } else {
      continue;
    }
    if (region === preferred) return { box, region };
    fallback ??= { box, region };
  }
  if (fallback) return fallback;
  const header = scanRegion('header').box;
  return header ? { box: header, region: null } : null;
}

/** A real count for an arrival chip: array length, a numeric `total`, or the length of an `items` / `rows` list. */
function arrivalCount(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data === null || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.total === 'number') return record.total;
  if (Array.isArray(record.items)) return record.items.length;
  if (Array.isArray(record.rows)) return record.rows.length;
  return null;
}

/**
 * The Daily agenda's open count, straight from the two queries the page reads
 * (today's checklist report + the `all` × `mine` task desk — the page's
 * default view): checklist items the viewer has not ticked plus tasks not
 * DONE, exactly the agenda's own "Open" figure. Null until BOTH are cached.
 */
function readDailyOpenCount(queryClient: QueryClient): number | null {
  const report = queryClient.getQueryData(dailyChecksQueryOptions(getCurrentPSTDateKey()).queryKey);
  const tasks = queryClient.getQueryData(taskDeskQueryOptions('all', 'mine').queryKey);
  if (!report || !tasks) return null;
  const done = new Set(report.mine?.doneItemIds ?? []);
  let open = 0;
  for (const item of report.items) if (!done.has(item.id)) open += 1;
  for (const row of tasks) if (row.status !== 'DONE') open += 1;
  return open;
}

/** The viewer's checklist progress from the cached report; null without a report or with nothing on the list. */
function readChecklistProgress(queryClient: QueryClient): ChecklistProgress | null {
  const mine = queryClient.getQueryData(dailyChecksQueryOptions(getCurrentPSTDateKey()).queryKey)?.mine;
  if (!mine || mine.total <= 0) return null;
  return { done: Math.min(mine.doneCount, mine.total), total: mine.total };
}

/** Full-viewport polygon with one hole per box (even-odd), so the ground stays only where no veil stands. */
function cutAway(boxes: readonly Box[]): string | undefined {
  if (boxes.length === 0) return undefined;
  const points = ['0 0', '100% 0', '100% 100%', '0 100%', '0 0'];
  for (const { left, top, width, height } of boxes) {
    const right = left + width;
    const bottom = top + height;
    points.push(
      `${left}px ${top}px`,
      `${right}px ${top}px`,
      `${right}px ${bottom}px`,
      `${left}px ${bottom}px`,
      `${left}px ${top}px`,
      '0 0',
    );
  }
  return `polygon(evenodd, ${points.join(', ')})`;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/** `inner` in `outer`'s own px, clamped to it; null when nothing is left. */
function localRect(outer: Box, inner: Box): { l: number; t: number; r: number; b: number } | null {
  const l = clamp(inner.left - outer.left, outer.width);
  const t = clamp(inner.top - outer.top, outer.height);
  const r = clamp(inner.left + inner.width - outer.left, outer.width);
  const b = clamp(inner.top + inner.height - outer.top, outer.height);
  return r - l >= 1 && b - t >= 1 ? { l, t, r, b } : null;
}

/** `outer` with one rounded, even-odd hole where `inner` sits (radius 0 = square hole). */
function holeClip(outer: Box, inner: Box, radius: number): string | undefined {
  const rect = localRect(outer, inner);
  if (!rect) return undefined;
  const { l, t, r, b } = rect;
  const { width: w, height: h } = outer;
  const k = Math.min(radius, (r - l) / 2, (b - t) / 2);
  const hole =
    k > 0
      ? `M${l + k} ${t}H${r - k}A${k} ${k} 0 0 1 ${r} ${t + k}V${b - k}A${k} ${k} 0 0 1 ${r - k} ${b}H${l + k}A${k} ${k} 0 0 1 ${l} ${b - k}V${t + k}A${k} ${k} 0 0 1 ${l + k} ${t}Z`
      : `M${l} ${t}H${r}V${b}H${l}Z`;
  return `path(evenodd, "M0 0H${w}V${h}H0Z ${hole}")`;
}

function inset(box: Box, by: number): Box {
  return {
    left: box.left + by,
    top: box.top + by,
    width: Math.max(1, box.width - by * 2),
    height: Math.max(1, box.height - by * 2),
  };
}

function spotFor(key: string, box: Box, radius: number): SpotTarget {
  return { key: `${key}:${box.left},${box.top},${box.width},${box.height}`, box, radius };
}

/** The spotlight's shape over a region: a pill on the header, a rounded rect on the sidebar, the agenda (else main). */
function regionSpot(id: PhaseId, boxes: Partial<Record<RegionId, Box>>): SpotTarget | null {
  if (id === 'header') {
    const box = boxes.header;
    if (!box) return null;
    const pill = inset(box, SPOT_INSET_PX.header);
    return spotFor('header', pill, pill.height / 2);
  }
  if (id === 'sidebar') {
    return boxes.sidebar ? spotFor('sidebar', inset(boxes.sidebar, SPOT_INSET_PX.sidebar), SIDEBAR_SPOT_RADIUS_PX) : null;
  }
  const box = boxes.focus ?? boxes.main;
  return box ? spotFor('main', inset(box, SPOT_INSET_PX.main), AGENDA_SPOT_RADIUS_PX) : null;
}

/** The rounded inset a region's veil fades back into. */
function veilOpenClip(id: PhaseId, box: Box): string {
  const by = VEIL_INSET_PX[id];
  const radius = id === 'header' ? Math.max(0, (box.height - by * 2) / 2) : VEIL_RADIUS_PX;
  return `inset(${by}px round ${radius}px)`;
}

// ─── Transitions & variants (every timing is a grammar token) ───────────────

const OVERLAY_EXIT = { opacity: 0, transition: exit } as const;
/** Reduced motion: every piece crossfades. */
const CROSSFADE: Transition = reducedMotion.enter;

/** The avatar settles in alongside the first glyphs (scale only — it is already visible in the static twins). */
const AVATAR_INITIAL = { scale: 0.9 } as const;
const AVATAR_ANIMATE = { scale: 1, transition: { ...settleSpring, delay: PHASE.AVATAR_DELAY } } as const;

/** Specular glint across the name once its glyphs have mostly landed. */
const glintVariants: Variants = {
  hidden: { x: '-100%' },
  shown: { x: '300%', transition: glint },
};

/** The spotlight glides + reshapes on `move` and dissolves at the end. */
const SPOTLIGHT_TRANSITION: Transition = { layout: move, borderRadius: move, opacity: exit };

/** A region's veil fades back into its rounded inset. `custom` = that inset. */
const veilVariants: Variants = {
  shut: { opacity: 1, clipPath: 'inset(0px round 0px)' },
  open: (clip: string) => ({ opacity: 0, clipPath: clip, transition: veilLift }),
};

const veilFadeVariants: Variants = {
  shut: { opacity: 1 },
  open: { opacity: 0, transition: CROSSFADE },
};

/** The ambient layer recedes behind the regions once the card has gone (opacity, not timing). */
const AMBIENT_ASSEMBLY_OPACITY = 0.55;

const agendaChipVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: move },
};

const agendaChipFadeVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: CROSSFADE },
};

const CHIP_INITIAL = { opacity: 0, y: 10 } as const;
const CHIP_ANIMATE = { opacity: 1, y: 0, transition: move } as const;
const CHIP_EXIT = { opacity: 0, y: -14, transition: exit } as const;
const CHIP_FADE_INITIAL = { opacity: 0 } as const;
const CHIP_FADE_ANIMATE = { opacity: 1, transition: CROSSFADE } as const;
const CHIP_FADE_EXIT = { opacity: 0, transition: reducedMotion.exit } as const;

const SKIP_CAPTION_INITIAL = { opacity: 0 } as const;
const SKIP_CAPTION_ANIMATE = { opacity: 0.85, transition: skipHint } as const;

// ─── Static layout ───────────────────────────────────────────────────────────

const GLINT_STYLE = { skewX: -18 } as const;

/** Soft pill: arrival chips, the agenda chip, the skip caption. */
const SOFT_CHIP_CLASS =
  'flex items-center gap-2 whitespace-nowrap rounded-full bg-surface-canvas/85 px-3 py-1 text-role-caption shadow-sm ring-1 ring-border-hairline';

// ─── Staff colour ────────────────────────────────────────────────────────────

interface StaffColorRow {
  id: number;
  color_hex?: string | null;
}

/** Same key + endpoint as StaffColorsProvider's idle warm-up, so this read lands in (and dedupes against) the one shared roster query. */
async function fetchStaffRoster(): Promise<StaffColorRow[]> {
  const res = await fetch('/api/staff?active=false', { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/staff failed: ${res.status}`);
  const json: unknown = await res.json();
  return Array.isArray(json) ? (json as StaffColorRow[]) : [];
}

/**
 * The signed-in staffer's assigned colour. StaffColorsProvider only warms the
 * cache on idle — after this overlay has already painted — so pull the shared
 * roster query forward and patch just this staffer's row. The version
 * subscription re-renders the overlay when the colour lands, mid-animation or
 * not; the root then tweens `--cf-welcome-name` (and with it the whole
 * palette) to it.
 */
function useSelfStaffColor(staffId: number | null): string {
  const queryClient = useQueryClient();
  useStaffColorVersion();

  useEffect(() => {
    if (!staffId) return;
    queryClient
      .fetchQuery({ queryKey: qk.staff.all, queryFn: fetchStaffRoster, staleTime: STAFF_ROSTER_STALE_MS })
      .then((rows: StaffColorRow[]) => {
        const hex = rows.find((row) => Number(row.id) === staffId)?.color_hex;
        if (hex && hex.toLowerCase() !== getStaffColorHex({ id: staffId })) setStaffColorHex(staffId, hex);
      })
      .catch(() => {
        // Cold roster + failed read: the provider's idle warm-up retries.
      });
  }, [queryClient, staffId]);

  return getStaffColorHex({ id: staffId });
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

export interface WelcomeAssemblyProps {
  /** Overlay exit animation finished (AnimatePresence onExitComplete): safe to unmount. */
  onExited: () => void;
}

export function WelcomeAssembly({ onExited }: WelcomeAssemblyProps) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;
  const name = user?.name ?? null;
  const avatarPhotoId = user?.avatarPhotoId;
  const nameHex = useSelfStaffColor(staffId);
  const reduceMotion = useReducedMotion() ?? false;
  const queryClient = useQueryClient();

  /** Resolved once per mount (a replay remounts): PST calendar, `?welcomeTheme=` outside production. */
  const [theme] = useState<WelcomeTheme>(() => resolveWelcomeTheme(new Date(), readWelcomeThemeOverride()));
  const paletteStyle = useMemo(() => welcomePaletteStyle(theme), [theme]);
  const [open, setOpen] = useState(true);
  const [stage, setStage] = useState<Stage>('greeting');
  /** Every greeting glyph has landed (or, reduced, the line has crossfaded in). */
  const [greetingSettled, setGreetingSettled] = useState(false);
  /** The tail (", {name}") has left and is unmounted; the card has narrowed to the greeting. */
  const [tailGone, setTailGone] = useState(false);
  const [landing, setLanding] = useState<Landing | null>(null);
  const [cardGone, setCardGone] = useState(false);
  /** The avatar slot's box: where the spotlight starts. */
  const [avatarBox, setAvatarBox] = useState<Box | null>(null);
  /** Measured region boxes (viewport px). */
  const [boxes, setBoxes] = useState<Partial<Record<RegionId, Box>>>({});
  const [absent, setAbsent] = useState<Partial<Record<PhaseId, true>>>({});
  /** Elapsed ms at which each region's own readiness signal fired. */
  const [arrivedAt, setArrivedAt] = useState<Partial<Record<RegionId, number>>>({});
  /** The discovered focus region (null = none on the page: `<main>` itself is the focus). */
  const [focus, setFocus] = useState<WelcomeFocus | null>(null);
  const [steps, setSteps] = useState<Partial<Record<PhaseId, Step>>>({});
  /** Index into PHASES of the running phase; -1 = not started, PHASES.length = all done. */
  const [cursor, setCursor] = useState(-1);
  /** The agenda is unveiled: its chip shows. */
  const [lit, setLit] = useState(false);
  /** Real counts (null = no data, no number). */
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<ChecklistProgress | null>(null);
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const weekday = useMemo(() => welcomeWeekday(), []);

  // Latest callback without re-arming listeners/timers when WelcomeHost re-renders.
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });
  const exitedRef = useRef(false);
  const startedAtRef = useRef(0);
  /** Log line ids stay unique across StrictMode's effect re-run. */
  const lineIdRef = useRef(0);
  /** Earliest `performance.now()` the running phase may start. */
  const dueAtRef = useRef(0);
  const boxesRef = useRef<Partial<Record<RegionId, Box>>>({});
  const settledRef = useRef<Set<PhaseId>>(new Set());
  const cardRef = useRef<HTMLDivElement>(null);
  const cardTextRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLSpanElement>(null);
  /** The card's width just before the tail unmounted: the FLIP's "first". */
  const wideWidthRef = useRef(0);
  /** When the running phase's REGION_LOCK beat ends (`performance.now()`). */
  const lockEndsAtRef = useRef(0);

  /** Start the overlay's exit (the real UI is already live underneath). */
  const resolve = useCallback(() => setOpen(false), []);

  const handleExitComplete = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    onExitedRef.current();
  }, []);

  const pushLine = useCallback((text: string) => {
    const line = { id: lineIdRef.current++, at: Math.round(performance.now() - startedAtRef.current), text };
    setLog((prev) => [...prev, line].slice(-LOG_LIMIT));
  }, []);

  const setStep = useCallback((id: PhaseId, step: Step) => {
    setSteps((prev) => (prev[id] === step ? prev : { ...prev, [id]: step }));
  }, []);

  /** Schedule the first phase at or after `from` that is on screen; absent ones are logged and skipped without a gap. */
  const advance = useCallback(
    (from: number) => {
      for (let index = from; index < PHASES.length; index++) {
        const id = PHASES[index];
        if (phaseAbsent(id)) {
          pushLine(`${PHASE_LOG[id]} · ${id === 'sidebar' ? 'closed' : 'absent'} · skipped`);
          setStep(id, 'skipped');
          continue;
        }
        dueAtRef.current = performance.now() + PHASE_LEAD_MS[id];
        setStep(id, 'wait');
        setCursor(index);
        return;
      }
      setCursor(PHASES.length);
    },
    [pushLine, setStep],
  );

  const settle = useCallback(
    (id: PhaseId) => {
      if (settledRef.current.has(id)) return;
      settledRef.current.add(id);
      pushLine(`${PHASE_LOG[id]} · ready`);
      setStep(id, 'settled');
      advance(PHASES.indexOf(id) + 1);
    },
    [advance, pushLine, setStep],
  );

  // ── Signals: DOM presence + boxes, paint marks, React Query arrivals ──────
  useEffect(() => {
    if (!startedAtRef.current) startedAtRef.current = performance.now();
    const arrived = new Set<RegionId>();
    const arrive = (id: RegionId, text: string) => {
      if (arrived.has(id)) return;
      arrived.add(id);
      const at = Math.round(performance.now() - startedAtRef.current);
      setArrivedAt((prev) => ({ ...prev, [id]: at }));
      pushLine(text);
    };

    let lastBoxes = '';
    let lastAbsent = '';
    let lastFocus = '';
    let focusLabel = '';
    let focusMark: string | null = null;
    let frame = 0;
    const scan = () => {
      frame = 0;
      const nextBoxes: Partial<Record<RegionId, Box>> = {};
      const nextAbsent: Partial<Record<PhaseId, true>> = {};
      for (const id of PHASES) {
        const region = scanRegion(id);
        if (region.box) nextBoxes[id] = region.box;
        if (region.absent) nextAbsent[id] = true;
        if (region.present) arrive(id, `${PHASE_LOG[id]} · present`);
      }
      const found = scanFocus();
      const focusKey = found ? JSON.stringify([found.label, found.mark]) : '';
      if (focusKey !== lastFocus) {
        lastFocus = focusKey;
        focusLabel = found?.label ?? '';
        focusMark = found?.mark ?? null;
        setFocus(found ? { label: found.label, mark: found.mark } : null);
        // Marks dedupe per navigation: a replay (or a region that painted before it was found) sees no new event.
        if (focusMark !== null && readPaintMarks().some((mark) => mark.surface === focusMark)) {
          arrive('focus', `${focusLabel} · painted earlier`);
        }
      }
      if (found?.box) nextBoxes.focus = found.box;
      if (found && found.mark === null && found.hasContent) arrive('focus', `${found.label} · present`);
      // Our own renders mutate the DOM too: only commit real changes, or the observer loops.
      const boxesKey = JSON.stringify(nextBoxes);
      if (boxesKey !== lastBoxes) {
        lastBoxes = boxesKey;
        boxesRef.current = nextBoxes;
        setBoxes(nextBoxes);
      }
      const absentKey = JSON.stringify(nextAbsent);
      if (absentKey !== lastAbsent) {
        lastAbsent = absentKey;
        setAbsent(nextAbsent);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };

    const onPaintMark = (event: Event) => {
      const surface = (event as CustomEvent<{ surface?: unknown }>).detail?.surface;
      if (typeof surface !== 'string') return;
      if (focusMark !== null && surface === focusMark) arrive('focus', `${focusLabel} · painted`);
      else pushLine(`${surface} · painted`);
      schedule();
    };

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const head = event.query.queryKey[0];
      const key = typeof head === 'string' ? head : JSON.stringify(head);
      if (event.action.type === 'error') {
        pushLine(`${key} · error`);
      } else if (event.action.type === 'success' && !event.action.manual) {
        const count = arrivalCount(event.query.state.data);
        pushLine(count === null ? `${key} · ok` : `${key} · ${count}`);
      }
    });

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('cf-paint-mark', onPaintMark);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('cf-paint-mark', onPaintMark);
      unsubscribe();
    };
  }, [pushLine, queryClient]);

  // The Daily counts (only while the discovered focus is the Daily agenda): read now, re-read whenever either
  // source query settles (optimistic ticks included). Null until the Daily queries are cached.
  const focusMark = focus?.mark ?? null;
  useEffect(() => {
    if (focusMark !== DAILY_FOCUS_MARK) return;
    const read = () => {
      setOpenCount(readDailyOpenCount(queryClient));
      const next = readChecklistProgress(queryClient);
      setChecklist((prev) => (prev?.done === next?.done && prev?.total === next?.total ? prev : next));
    };
    read();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const head = event.query.queryKey[0];
      if (head === 'daily-checks' || head === 'tasks') read();
    });
  }, [focusMark, queryClient]);

  // ── Phase 1: greeting → name exit → travel ────────────────────────────────
  // The spotlight starts AS the avatar's ring: measure before paint so the ring never blinks.
  const cardAtRest = stage === 'greeting' || stage === 'name-exit';
  useLayoutEffect(() => {
    if (!cardAtRest) return;
    const read = () => {
      const next = measure(avatarRef.current);
      setAvatarBox((prev) =>
        prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };
    read();
    // Late fonts / the name arriving / the tail leaving resize the card, and with it where the avatar sits.
    const observer = new ResizeObserver(read);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', read);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [cardAtRest]);

  /** Hold over: the card leaves centre for the search well (reduced motion: it simply fades). */
  const beginTravel = useCallback(() => {
    if (reduceMotion) {
      setStage('assembly');
      return;
    }
    const target = findLanding();
    if (!target) {
      pushLine('Search · not on screen');
      setStage('assembly');
      return;
    }
    setLanding(target);
    setStage('travel');
  }, [reduceMotion, pushLine]);

  // (b) Hold on the full greeting, then (c) the name leaves first — or, with no name, straight to travel.
  useEffect(() => {
    // A skip mid-hold leaves the overlay exiting on the greeting.
    if (!greetingSettled || !open || stage !== 'greeting') return;
    const timer = window.setTimeout(() => {
      if (name) setStage('name-exit');
      else beginTravel();
    }, ms(PHASE.HOLD));
    return () => window.clearTimeout(timer);
  }, [greetingSettled, open, stage, name, beginTravel]);

  /** The card has narrowed to the greeting (or, reduced, the tail has crossfaded out in place). */
  const [narrowed, setNarrowed] = useState(false);
  const handleTailOut = useCallback(() => {
    if (reduceMotion) {
      setNarrowed(true);
      return;
    }
    wideWidthRef.current = cardRef.current?.offsetWidth ?? 0;
    setTailGone(true);
  }, [reduceMotion]);

  // (c) FLIP the card's width: the tail is unmounted, so layout is already narrow; scale the card from its old
  // width back to 1 (radius and contents counter-scaled so neither distorts). Transform only, on `settle`.
  useLayoutEffect(() => {
    if (!tailGone) return;
    const card = cardRef.current;
    const column = cardTextRef.current;
    const narrow = card?.offsetWidth ?? 0;
    if (!card || !column || !narrow || !wideWidthRef.current) {
      setNarrowed(true);
      return;
    }
    const from = wideWidthRef.current / narrow;
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    const paint = (scale: number) => {
      card.style.transform = `scaleX(${scale})`;
      card.style.borderRadius = `${radius / scale}px / ${radius}px`;
      column.style.transform = `scaleX(${1 / scale})`;
    };
    const clear = () => {
      card.style.transform = '';
      card.style.borderRadius = '';
      column.style.transform = '';
    };
    let cancelled = false;
    paint(from);
    const narrowing = animate(from, 1, { ...settleSpring, onUpdate: paint });
    narrowing.then(() => {
      if (cancelled) return;
      clear();
      setNarrowed(true);
    });
    return () => {
      cancelled = true;
      narrowing.stop();
      clear();
    };
  }, [tailGone]);

  // (c→d) A beat after the name has gone, the card travels.
  useEffect(() => {
    if (!narrowed || !open || stage !== 'name-exit') return;
    const timer = window.setTimeout(beginTravel, ms(PHASE.NAME_EXIT_GAP));
    return () => window.clearTimeout(timer);
  }, [narrowed, open, stage, beginTravel]);

  // (d) Manual FLIP: the card travels centre → the search well (top-left) on `travel(distance)`, flattening onto it
  // (radius → 0 on `handoff`, flush with the real control). Its contents fade on `exit` from the first frame and are
  // counter-scaled to the card's SMALLER axis, so they shrink uniformly — text never squashes while the shape morphs.
  useEffect(() => {
    if (stage !== 'travel' || !landing) return;
    const card = cardRef.current;
    const column = cardTextRef.current;
    if (!card || !column) {
      setStage('assembly');
      return;
    }
    const from = card.getBoundingClientRect();
    const to = landing.box;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const toScaleX = to.width / from.width;
    const toScaleY = to.height / from.height;
    let progress = 0;
    let radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    const paint = () => {
      const scaleX = 1 + (toScaleX - 1) * progress;
      const scaleY = 1 + (toScaleY - 1) * progress;
      const uniform = Math.min(scaleX, scaleY);
      card.style.transform = `translate(${dx * progress}px, ${dy * progress}px) scale(${scaleX}, ${scaleY})`;
      card.style.borderRadius = `${radius / scaleX}px / ${radius / scaleY}px`;
      column.style.transform = `scale(${uniform / scaleX}, ${uniform / scaleY})`;
    };
    let cancelled = false;
    const flight = animate(0, 1, {
      ...travel(Math.hypot(dx, dy)),
      onUpdate: (value) => {
        progress = value;
        paint();
      },
    });
    const flatten = animate(radius, 0, {
      ...handoff,
      onUpdate: (value) => {
        radius = value;
        paint();
      },
    });
    const fade = animate(column, { opacity: 0 }, exit);
    flight.then(() => {
      if (cancelled) return;
      pushLine(landing.region ? `Search · landed · ${PHASE_LOG[landing.region]}` : 'Search · none · header');
      setStage('assembly');
    });
    return () => {
      cancelled = true;
      flight.stop();
      flatten.stop();
      fade.stop();
    };
  }, [stage, landing, pushLine]);

  // The veils are mounted (search hole cut) under the landed card: dissolve it onto the real control.
  useEffect(() => {
    if (stage !== 'assembly' || cardGone) return;
    const card = cardRef.current;
    if (!card) {
      setCardGone(true);
      return;
    }
    let cancelled = false;
    const dissolve = animate(card, { opacity: 0 }, reduceMotion ? reducedMotion.exit : exit);
    dissolve.then(() => {
      if (!cancelled) setCardGone(true);
    });
    return () => {
      cancelled = true;
      dissolve.stop();
    };
  }, [stage, cardGone, reduceMotion]);

  // ── Phases 2–4: header → sidebar → main ─────────────────────────────────
  /** The card has left centre: veils are up and the spotlight rides along to the first region. */
  const revealing = stage === 'travel' || stage === 'assembly';
  /** The card is on the search (or never travelled): veils may lift. */
  const landed = stage === 'assembly';
  useEffect(() => {
    if (revealing) advance(0);
  }, [revealing, advance]);

  const current = cursor >= 0 && cursor < PHASES.length ? PHASES[cursor] : null;
  const currentStep = current ? steps[current] : undefined;
  // Main waits on the discovered focus region's readiness too; with none on the page, `<main>` itself is the focus.
  const currentReady =
    current === 'main'
      ? arrivedAt.main !== undefined && (focus === null || arrivedAt.focus !== undefined)
      : current !== null && arrivedAt[current] !== undefined;

  // Start = max(scheduled time, the region's readiness).
  useEffect(() => {
    if (!open || !current || currentStep !== 'wait' || !currentReady) return;
    const timer = window.setTimeout(
      () => {
        lockEndsAtRef.current = performance.now() + ms(PHASE.REGION_LOCK);
        setStep(current, 'lock');
      },
      Math.max(0, dueAtRef.current - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [open, current, currentStep, currentReady, setStep]);

  // Ready under the spotlight, and the card down → the veil lifts and the phase settles (main unveils its agenda first).
  useEffect(() => {
    if (!open || !current || currentStep !== 'lock' || !landed) return;
    const timer = window.setTimeout(
      () => {
        const hasFocus = current === 'main' && boxesRef.current.focus !== undefined;
        if (hasFocus) setLit(true);
        if (hasFocus && !reduceMotion && boxesRef.current.main) setStep('main', 'focus');
        else settle(current);
      },
      Math.max(0, lockEndsAtRef.current - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [open, current, currentStep, landed, reduceMotion, settle, setStep]);

  // Agenda hold (its veil lifting), then the rest of main unveils.
  useEffect(() => {
    if (!open || steps.main !== 'focus') return;
    const timer = window.setTimeout(() => settle('main'), ms(PHASE.FOCUS_HOLD));
    return () => window.clearTimeout(timer);
  }, [open, steps.main, settle]);

  // ── End: shapes drift out, the spotlight dissolves, then the overlay leaves ──
  const done = cursor >= PHASES.length;
  useEffect(() => {
    if (!open || !done) return;
    const timer = window.setTimeout(resolve, END_EXIT_AT_MS);
    return () => window.clearTimeout(timer);
  }, [open, done, resolve]);
  const ending = done;

  useEffect(() => {
    const timer = window.setTimeout(resolve, ms(PHASE.HARD_CAP));
    return () => window.clearTimeout(timer);
  }, [resolve]);

  // ── Skip ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Capture on window runs first: the skipping key never reaches the live page's hotkeys.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || MODIFIER_KEYS[event.key]) return;
      event.stopImmediatePropagation();
      resolve();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, resolve]);

  const handleGreetingIn = useCallback(() => setGreetingSettled(true), []);

  // ── Derived layout ─────────────────────────────────────────────────────────
  const assembling = stage === 'assembly';
  const mainBox = boxes.main;
  const focusBox = boxes.focus;
  const tiles = revealing
    ? PHASES.flatMap((id) => {
        const box = boxes[id];
        return box && !absent[id] ? [box] : [];
      })
    : [];

  /** At rest: the avatar ring. Revealing: the running phase's region (before the first phase is scheduled: the first on screen; after the last: where it ended). */
  let spotPhase: PhaseId | null = null;
  if (revealing) {
    spotPhase =
      current ??
      (done
        ? ([...PHASES].reverse().find((id) => steps[id] === 'settled' && boxes[id]) ?? null)
        : (PHASES.find((id) => boxes[id] && !absent[id]) ?? null));
  }
  const spotTarget = spotPhase
    ? regionSpot(spotPhase, boxes)
    : !revealing && avatarBox
      ? spotFor('avatar', avatarBox, avatarBox.width / 2)
      : null;

  const mainState = steps.main === 'settled' ? 'open' : 'shut';
  const focusState = steps.main === 'focus' || mainState === 'open' ? 'open' : 'shut';

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && (
        <motion.div
          key="welcome-overlay"
          role="status"
          aria-live="polite"
          className={WELCOME_ROOT_CLASS}
          initial={false}
          style={paletteStyle as CSSProperties}
          animate={{ '--cf-welcome-name': nameHex }}
          transition={colorTween}
          exit={OVERLAY_EXIT}
          onPointerDown={resolve}
        >
          <span className="sr-only">{welcomeStatusText(theme.greeting, name)}</span>

          <div aria-hidden className={WELCOME_GROUND_CLASS} style={{ clipPath: cutAway(tiles) }}>
            <div className={WELCOME_GROUND_GRAIN_CLASS} />
          </div>

          {revealing &&
            PHASES.map((id) => {
              const box = boxes[id];
              if (!box || absent[id]) return null;
              if (id === 'main') {
                return (
                  <Veil
                    key={id}
                    box={box}
                    hole={focusBox ? holeClip(box, focusBox, FOCUS_WINDOW_RADIUS_PX) : undefined}
                    openClip={veilOpenClip('main', box)}
                    state={mainState}
                    reduceMotion={reduceMotion}
                  />
                );
              }
              const well = landing?.region === id ? landing.box : null;
              return (
                <Veil
                  key={id}
                  box={box}
                  hole={well ? holeClip(box, well, 0) : undefined}
                  openClip={veilOpenClip(id, box)}
                  state={steps[id] === 'settled' ? 'open' : 'shut'}
                  reduceMotion={reduceMotion}
                />
              );
            })}

          {revealing && mainBox && focusBox && (
            <Veil
              box={focusBox}
              openClip={`inset(${VEIL_INSET_PX.main}px round ${VEIL_RADIUS_PX}px)`}
              state={focusState}
              reduceMotion={reduceMotion}
            />
          )}

          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={false}
            animate={{ opacity: assembling ? AMBIENT_ASSEMBLY_OPACITY : 1 }}
            transition={reduceMotion ? CROSSFADE : recede}
          >
            <AmbientLayer theme={theme} phase={ending ? 'leave' : 'drift'} still={reduceMotion} />
          </motion.div>

          {!cardGone && (
            <GreetingCard
              theme={theme}
              stage={stage}
              tailGone={tailGone}
              greetingSettled={greetingSettled}
              name={name}
              staffId={staffId}
              avatarPhotoId={avatarPhotoId}
              colorHex={nameHex}
              weekday={weekday}
              openCount={openCount}
              frosted={stage === 'greeting'}
              cardRef={cardRef}
              textRef={cardTextRef}
              avatarRef={avatarRef}
              reduceMotion={reduceMotion}
              onGreetingIn={handleGreetingIn}
              onTailOut={handleTailOut}
            />
          )}

          {spotTarget && <Spotlight target={spotTarget} hex={nameHex} gone={ending} reduceMotion={reduceMotion} />}

          {lit && focusBox && (openCount !== null || checklist) && (
            <AgendaChip box={focusBox} count={openCount} checklist={checklist} gone={ending} reduceMotion={reduceMotion} />
          )}

          <ArrivalChips lines={log} reduceMotion={reduceMotion} />

          <SkipCaption />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * A region's veil: the lobby tint over the real region, fading back into a
 * rounded inset when its readiness fires. `hole` (static, on the host) lets
 * the real search well — or, on main, the agenda's own veil — show through.
 */
function Veil({
  box,
  hole,
  openClip,
  state,
  reduceMotion,
}: {
  box: Box;
  hole?: string;
  openClip: string;
  state: 'shut' | 'open';
  reduceMotion: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, clipPath: hole }}
    >
      <motion.div
        className={WELCOME_GROUND_CLASS}
        custom={openClip}
        variants={reduceMotion ? veilFadeVariants : veilVariants}
        initial={false}
        animate={state}
      >
        <div className={WELCOME_GROUND_GRAIN_CLASS} />
      </motion.div>
    </div>
  );
}

/**
 * The greeting card — the resting frame shared with WelcomeBridge /
 * BOOT_SPLASH_SCRIPT. "{greeting}, {name}" enters glyph by glyph as ONE line
 * (three SplitTexts on one stagger sequence) while the avatar settles; on
 * 'name-exit' the tail ", {name}" leaves in reverse (name's last glyph first,
 * the comma last) and then unmounts, and the parent FLIPs the card's width.
 * The card and its column are then driven imperatively by the travel (manual
 * FLIP). The avatar slot carries no ring of its own: the spotlight draws it.
 */
function GreetingCard({
  theme,
  stage,
  tailGone,
  greetingSettled,
  name,
  staffId,
  avatarPhotoId,
  colorHex,
  weekday,
  openCount,
  frosted,
  cardRef,
  textRef,
  avatarRef,
  reduceMotion,
  onGreetingIn,
  onTailOut,
}: {
  theme: WelcomeTheme;
  stage: Stage;
  tailGone: boolean;
  greetingSettled: boolean;
  name: string | null;
  staffId: number | null;
  avatarPhotoId: number | null | undefined;
  colorHex: string;
  weekday: string;
  openCount: number | null;
  frosted: boolean;
  cardRef: RefObject<HTMLDivElement>;
  textRef: RefObject<HTMLDivElement>;
  avatarRef: RefObject<HTMLSpanElement>;
  reduceMotion: boolean;
  onGreetingIn: () => void;
  onTailOut: () => void;
}) {
  const greetingCount = countGlyphs(theme.greeting);
  const separatorCount = countGlyphs(WELCOME_TAIL_SEPARATOR);
  const tailCount = name ? separatorCount + countGlyphs(name) : 0;
  const lineCount = greetingCount + tailCount;
  const tailState = stage === 'greeting' ? 'in' : 'out';
  const handleGreetingDone = (state: 'in' | 'out') => {
    if (state === 'in' && !name) onGreetingIn();
  };
  const handleNameDone = (state: 'in' | 'out') => {
    if (state === 'in') onGreetingIn();
  };
  // Reverse stagger: the comma is first in the tail, so it leaves last.
  const handleSeparatorDone = (state: 'in' | 'out') => {
    if (state === 'out') onTailOut();
  };
  return (
    <div aria-hidden className={WELCOME_STAGE_CLASS}>
      <div ref={cardRef} className={cn(WELCOME_CARD_CLASS, frosted && WELCOME_FROST_CLASS)}>
        <div className={WELCOME_CARD_GRAIN_CLASS} />
        <div ref={textRef} className={WELCOME_COLUMN_CLASS}>
          <span ref={avatarRef} className={WELCOME_AVATAR_SLOT_CLASS}>
            <motion.span className="block" initial={reduceMotion ? false : AVATAR_INITIAL} animate={AVATAR_ANIMATE}>
              <StaffAvatar
                staffId={staffId}
                name={name}
                avatarPhotoId={avatarPhotoId}
                colorHex={colorHex}
                size="2xl"
                ring={false}
              />
            </motion.span>
          </span>

          <p className={WELCOME_HEADLINE_CLASS}>
            <SplitText
              text={theme.greeting}
              variant={theme.charVariant}
              animate="in"
              delay={PHASE.GREETING_DELAY}
              enterSeq={{ offset: 0, count: lineCount }}
              reduced={reduceMotion}
              announce={false}
              onComplete={handleGreetingDone}
            />
            {name && !tailGone && (
              <span>
                <SplitText
                  text={WELCOME_TAIL_SEPARATOR}
                  variant={theme.charVariant}
                  animate={tailState}
                  delay={PHASE.GREETING_DELAY}
                  enterSeq={{ offset: greetingCount, count: lineCount }}
                  exitSeq={{ offset: 0, count: tailCount }}
                  reduced={reduceMotion}
                  announce={false}
                  onComplete={handleSeparatorDone}
                />
                <span className={WELCOME_NAME_GLOW_CLASS}>
                  <SplitText
                    text={name}
                    variant={theme.charVariant}
                    animate={tailState}
                    glyphClassName={WELCOME_NAME_INK_CLASS}
                    delay={PHASE.GREETING_DELAY}
                    enterSeq={{ offset: greetingCount + separatorCount, count: lineCount }}
                    exitSeq={{ offset: separatorCount, count: tailCount }}
                    reduced={reduceMotion}
                    announce={false}
                    onComplete={handleNameDone}
                  />
                  {!reduceMotion && (
                    <span className={WELCOME_GLINT_CLIP_CLASS}>
                      <motion.span
                        variants={glintVariants}
                        initial="hidden"
                        animate={greetingSettled && stage === 'greeting' ? 'shown' : 'hidden'}
                        style={GLINT_STYLE}
                        className="cf-welcome-glint absolute inset-y-0 left-0 w-1/3 mix-blend-overlay"
                      />
                    </span>
                  )}
                </span>
              </span>
            )}
          </p>

          <p className={WELCOME_SOFT_LINE_CLASS}>
            {weekday}
            {openCount !== null && (
              <>
                {' · '}
                <CountUp count={openCount} reduceMotion={reduceMotion} />
                {' open today'}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The one spotlight. Starts as the avatar's ring, then glides region to region:
 * a Motion layout animation (transform only, with the ring's box-shadow and
 * the animated radius scale-corrected), keyed so it re-measures only when the
 * target moves. Reduced motion: each position crossfades in place.
 */
const Spotlight = memo(function Spotlight({
  target,
  hex,
  gone,
  reduceMotion,
}: {
  target: SpotTarget;
  hex: string;
  gone: boolean;
  reduceMotion: boolean;
}) {
  const { key, box, radius } = target;
  const style = {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    boxShadow: spotlightShadow(hex),
    backgroundColor: `${hex}0d`,
  };
  if (reduceMotion) {
    return (
      <AnimatePresence initial={false}>
        {!gone && (
          <motion.div
            key={key}
            aria-hidden
            className="pointer-events-none absolute"
            style={{ ...style, borderRadius: radius }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CROSSFADE}
          />
        )}
      </AnimatePresence>
    );
  }
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute"
      layout
      layoutDependency={key}
      style={style}
      initial={false}
      animate={{ borderRadius: radius, opacity: gone ? 0 : 1 }}
      transition={SPOTLIGHT_TRANSITION}
    />
  );
});

/** Beside the spotlight's top edge on the agenda: today's checklist ring and the real open count (each only with data). Leaves with the spotlight. */
function AgendaChip({
  box,
  count,
  checklist,
  gone,
  reduceMotion,
}: {
  box: Box;
  count: number | null;
  checklist: ChecklistProgress | null;
  gone: boolean;
  reduceMotion: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -translate-y-1/2"
      style={{ left: box.left + SPOT_INSET_PX.main + AGENDA_SPOT_RADIUS_PX, top: box.top + SPOT_INSET_PX.main }}
    >
      <motion.div
        className={cn(SOFT_CHIP_CLASS, 'text-text-default')}
        variants={reduceMotion ? agendaChipFadeVariants : agendaChipVariants}
        initial="hidden"
        animate={gone ? 'hidden' : 'show'}
      >
        {checklist && <ChecklistRing progress={checklist} reduceMotion={reduceMotion} />}
        {count !== null && (
          <span className="tabular-nums">
            <CountUp count={count} reduceMotion={reduceMotion} /> open
          </span>
        )}
      </motion.div>
    </div>
  );
}

/** done / total of today's checklist as a staff-colour ring, drawing from 0 on the assembly spring. */
function ChecklistRing({ progress, reduceMotion }: { progress: ChecklistProgress; reduceMotion: boolean }) {
  const fraction = progress.done / progress.total;
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r="7.5" fill="none" strokeWidth="2.5" className="stroke-current opacity-15" />
      <motion.circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ stroke: 'var(--welcome-hue)' }}
        initial={{ pathLength: reduceMotion ? fraction : 0 }}
        animate={{ pathLength: fraction }}
        transition={reduceMotion ? instant : move}
      />
    </svg>
  );
}

/** A real count, ticking up from 0 on the assembly spring (straight to it under reduced motion). */
function CountUp({ count, reduceMotion }: { count: number; reduceMotion: boolean }) {
  const [shown, setShown] = useState(reduceMotion ? count : 0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(count));
    return () => cancelAnimationFrame(frame);
  }, [count]);
  return (
    <AnimateNumber transition={reduceMotion ? instant : move} className="tabular-nums">
      {shown}
    </AnimateNumber>
  );
}

/** Real arrivals as soft pills: each floats up into the stack, lives PHASE.CHIP_LIFE, then floats off and fades. */
function ArrivalChips({ lines, reduceMotion }: { lines: readonly LogLine[]; reduceMotion: boolean }) {
  /** Chips retire in arrival order, so one floor id retires every older line — including ones pushed out of view early. */
  const [retiredThrough, setRetiredThrough] = useState(-1);
  const retire = useCallback((id: number) => {
    setRetiredThrough((prev) => Math.max(prev, id));
  }, []);
  const live = lines.filter((line) => line.id > retiredThrough).slice(-CHIPS_VISIBLE);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {live.map((line) => (
          <ArrivalChip key={line.id} line={line} reduceMotion={reduceMotion} onRetire={retire} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ArrivalChip({
  line,
  reduceMotion,
  onRetire,
}: {
  line: LogLine;
  reduceMotion: boolean;
  onRetire: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onRetire(line.id), ms(PHASE.CHIP_LIFE));
    return () => window.clearTimeout(timer);
  }, [line.id, onRetire]);
  return (
    <motion.div
      layout={reduceMotion ? false : 'position'}
      className={cn(SOFT_CHIP_CLASS, 'text-text-muted')}
      initial={reduceMotion ? CHIP_FADE_INITIAL : CHIP_INITIAL}
      animate={reduceMotion ? CHIP_FADE_ANIMATE : CHIP_ANIMATE}
      exit={reduceMotion ? CHIP_FADE_EXIT : CHIP_EXIT}
    >
      <span className="text-text-default">{line.text}</span>
      <span className="tabular-nums text-text-faint">{line.at} ms</span>
    </motion.div>
  );
}

function SkipCaption() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
      <motion.p
        aria-hidden
        className={cn(SOFT_CHIP_CLASS, 'text-text-muted')}
        initial={SKIP_CAPTION_INITIAL}
        animate={SKIP_CAPTION_ANIMATE}
      >
        Press any key to skip
      </motion.p>
    </div>
  );
}

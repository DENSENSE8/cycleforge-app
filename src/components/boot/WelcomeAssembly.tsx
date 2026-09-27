'use client';

/**
 * WelcomeAssembly — the post-sign-in welcome overlay BootGate holds while the
 * workspace prefetches.
 *
 * Two phases swap under `AnimatePresence mode="wait"`:
 *   1. Greeting — "Welcome back, {name}" snaps up out of a clip, the name in
 *      the staffer's own colour as polished metal, held ~1.2s.
 *   2. Assembly — a HUD wireframe of the workspace snaps together in order:
 *      header → triage focus cell → lane sidebar (+ tab cascade) → table rows
 *      → Find hint. When the last piece settles (+ a short dwell) the real UI
 *      is revealed behind the overlay and the overlay fades out.
 *
 * Any key (not a bare modifier, not a repeat) or a pointer-down skips straight
 * to the reveal. `onReveal` / `onExited` fire exactly once per mount; replay
 * is a remount with a new key.
 *
 * Material recipes (grain, specular, metallic ink, pulse) live in
 * src/app/globals.css under the `cf-welcome-*` block.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, stagger, type Transition, type Variants } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ListChecks,
  PackageOpen,
  RotateCcw,
  Search,
  TriangleAlert,
  Truck,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { qk } from '@/queries/keys';
import { cn } from '@/utils/_cn';
import { getStaffColorHex, setStaffColorHex } from '@/utils/staff-colors';

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Every piece that "snaps" into place rides this spring. */
export const SNAP_SPRING = { type: 'spring', stiffness: 300, damping: 24 } as const satisfies Transition;

/** How long the settled greeting holds before the assembly takes over. */
const GREETING_HOLD_MS = 1200;
/** Dwell on the finished assembly before the real UI is revealed. */
const ASSEMBLY_DWELL_MS = 600;
/** Mirrors StaffColorsProvider's staleTime on the shared roster query. */
const STAFF_ROSTER_STALE_MS = 5 * 60 * 1000;
/** Bare modifier presses never skip — they are usually the start of a chord. */
const MODIFIER_KEYS: Record<string, true> = { Shift: true, Control: true, Alt: true, Meta: true };

// ─── Variants ────────────────────────────────────────────────────────────────

const OVERLAY_EXIT = { opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } } as const;
const NAME_COLOR_TRANSITION: Transition = { duration: 0.45, ease: 'easeOut' };

const greetingVariants: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.1, staggerChildren: 0.1 } },
  exit: { opacity: 0, transition: { when: 'afterChildren', duration: 0.12, staggerChildren: 0.03 } },
};

const greetingLabelVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Mechanical clip reveal: each word rides up out of its own mask. */
const greetingWordVariants: Variants = {
  hidden: { y: '110%' },
  show: { y: 0, transition: SNAP_SPRING },
  exit: { y: '-110%', transition: { duration: 0.2, ease: 'easeIn' } },
};

/** Specular glint across the name once it has locked in. */
const glintVariants: Variants = {
  hidden: { x: '-100%' },
  show: { x: '300%', transition: { delay: 0.3, duration: 0.8, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

const greetingRuleVariants: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: SNAP_SPRING },
  exit: { scaleX: 0, transition: { duration: 0.18, ease: 'easeIn' } },
};

/** Orchestrator: children snap in, in DOM order, 0.1s apart. */
const assemblyVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, when: 'beforeChildren', staggerChildren: 0.1 } },
};

const headerVariants: Variants = {
  hidden: { y: '-100%' },
  show: { y: 0, transition: SNAP_SPRING },
};

const focusCellVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: SNAP_SPRING },
};

/** One brief ring pulse that draws the eye to the focus cell. */
const focusRingVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: [0, 0.8, 0],
    scale: [0.96, 1, 1.12],
    transition: { delay: 0.15, duration: 0.9, times: [0, 0.25, 1], ease: 'easeOut' },
  },
};

const readoutVariants: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.15, staggerChildren: 0.035 } },
};

const readoutSegmentVariants: Variants = {
  hidden: { opacity: 0.12, scaleY: 0.3 },
  show: { opacity: 1, scaleY: 1, transition: SNAP_SPRING },
};

/** Container slides in first, then its tabs cascade. */
const sidebarVariants: Variants = {
  hidden: { x: '-110%', opacity: 0 },
  show: {
    x: 0,
    opacity: 1,
    transition: { ...SNAP_SPRING, when: 'beforeChildren', delayChildren: stagger(0.05) },
  },
};

const sidebarTabVariants: Variants = {
  hidden: { x: -12, opacity: 0 },
  show: { x: 0, opacity: 1, transition: SNAP_SPRING },
};

const tableVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { ...SNAP_SPRING, when: 'beforeChildren', staggerChildren: 0.06 },
  },
};

const tableRowVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SNAP_SPRING },
};

const findHintVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: SNAP_SPRING },
};

const SKIP_CAPTION_INITIAL = { opacity: 0 } as const;
const SKIP_CAPTION_ANIMATE = { opacity: 0.55, transition: { delay: 0.8, duration: 0.4 } } as const;

// ─── Static layout ───────────────────────────────────────────────────────────

/** Grid areas decouple layout from DOM order — DOM order IS the stagger order. */
const FRAME_STYLE: CSSProperties = {
  gridTemplateAreas: '"header header" "side focus" "side table"',
};
const AREA_HEADER: CSSProperties = { gridArea: 'header' };
const AREA_SIDE: CSSProperties = { gridArea: 'side' };
const AREA_FOCUS: CSSProperties = { gridArea: 'focus' };
const AREA_TABLE: CSSProperties = { gridArea: 'table' };
const GLINT_STYLE = { skewX: -18 } as const;

const MICRO_LABEL = 'font-mono text-role-micro uppercase tracking-widest';

const CORNER_CLASSES = [
  'left-0 top-0 border-l border-t',
  'right-0 top-0 border-r border-t',
  'bottom-0 left-0 border-b border-l',
  'bottom-0 right-0 border-b border-r',
] as const;

const SIDEBAR_TABS = [
  { label: 'Outbound', icon: Truck },
  { label: 'Exceptions', icon: TriangleAlert },
  { label: 'Picking', icon: ListChecks },
  { label: 'Receiving', icon: PackageOpen },
  { label: 'Returns', icon: Undo2 },
] as const satisfies ReadonlyArray<{ label: string; icon: LucideIcon }>;

const READOUT_HEIGHTS = ['h-3', 'h-5', 'h-7', 'h-4', 'h-6', 'h-2'] as const;
const READOUT_SEGMENTS = Array.from(
  { length: 18 },
  (_, i) => READOUT_HEIGHTS[(i * 5 + 2) % READOUT_HEIGHTS.length],
);

const TABLE_GRID = 'grid grid-cols-[2.5rem_1.2fr_2fr_1fr_1fr_4.5rem]';
const TABLE_COLUMNS = ['', 'Order', 'Item', 'Lane', 'Status', 'Age'] as const;
const BAR_WIDTHS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-2/5', 'w-3/5'] as const;
/** 8 skeleton rows × the four text columns — deterministic, built once. */
const TABLE_ROWS = Array.from({ length: 8 }, (_, r) =>
  [0, 1, 2, 3].map((c) => BAR_WIDTHS[(r * 3 + c * 2) % BAR_WIDTHS.length]),
);

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
 * not; the root then tweens `--cf-welcome-name` to it.
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
  /** Timeline finished OR user skipped: mount the real UI behind the overlay now. Called exactly once per mount. */
  onReveal: () => void;
  /** Overlay exit animation finished (AnimatePresence onExitComplete): safe to unmount. */
  onExited: () => void;
}

type Phase = 'greeting' | 'assembly';

export function WelcomeAssembly({ onReveal, onExited }: WelcomeAssemblyProps) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;
  const name = user?.name ?? null;
  const nameHex = useSelfStaffColor(staffId);

  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>('greeting');
  const [greetingSettled, setGreetingSettled] = useState(false);
  const [assemblySettled, setAssemblySettled] = useState(false);

  // Latest callbacks without re-arming listeners/timers when BootGate re-renders.
  const callbacksRef = useRef({ onReveal, onExited });
  useEffect(() => {
    callbacksRef.current = { onReveal, onExited };
  });
  const revealedRef = useRef(false);
  const exitedRef = useRef(false);

  /** Reveal the real UI (once) and start the overlay's exit. */
  const resolve = useCallback(() => {
    if (!revealedRef.current) {
      revealedRef.current = true;
      callbacksRef.current.onReveal();
    }
    setOpen(false);
  }, []);

  const handleExitComplete = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    callbacksRef.current.onExited();
  }, []);

  useEffect(() => {
    // A skip mid-hold leaves the overlay exiting on the greeting; no swap.
    if (!greetingSettled || !open) return;
    const timer = window.setTimeout(() => setPhase('assembly'), GREETING_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [greetingSettled, open]);

  useEffect(() => {
    if (!assemblySettled) return;
    const timer = window.setTimeout(resolve, ASSEMBLY_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [assemblySettled, resolve]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || MODIFIER_KEYS[event.key]) return;
      resolve();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, resolve]);

  const handleGreetingComplete = useCallback((definition: unknown) => {
    if (definition === 'show') setGreetingSettled(true);
  }, []);
  const handleAssemblyComplete = useCallback((definition: unknown) => {
    if (definition === 'show') setAssemblySettled(true);
  }, []);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && (
        <motion.div
          key="welcome-overlay"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-splash select-none overflow-hidden bg-surface-canvas text-text-default"
          initial={false}
          animate={{ '--cf-welcome-name': nameHex }}
          transition={NAME_COLOR_TRANSITION}
          exit={OVERLAY_EXIT}
          onPointerDown={resolve}
        >
          <span className="sr-only">
            {name ? `Welcome back, ${name}. Loading your workspace.` : 'Welcome back. Loading your workspace.'}
          </span>

          <MetalGround phase={phase} />

          <AnimatePresence mode="wait">
            {phase === 'greeting' ? (
              <Greeting key="greeting" name={name} onAnimationComplete={handleGreetingComplete} />
            ) : (
              <Assembly key="assembly" onAnimationComplete={handleAssemblyComplete} />
            )}
          </AnimatePresence>

          <SkipCaption />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function HudCorners({ className }: { className?: string }) {
  return (
    <>
      {CORNER_CLASSES.map((corner) => (
        <span
          key={corner}
          aria-hidden
          className={cn('pointer-events-none absolute border-border-strong', corner, className)}
        />
      ))}
    </>
  );
}

/** Brushed-aluminium ground: grain, one specular sweep, tick rulers, corner brackets. */
function MetalGround({ phase }: { phase: Phase }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="cf-welcome-grain absolute inset-0" />
      <div className="cf-welcome-specular absolute inset-0" />
      <div className="cf-welcome-ticks-y absolute inset-y-24 left-1.5 w-1.5 text-border-strong opacity-30" />
      <div className="cf-welcome-ticks-x absolute inset-x-24 bottom-1.5 h-1.5 text-border-strong opacity-30" />
      <HudCorners className="m-3 size-6 border-2" />
      <span className={cn(MICRO_LABEL, 'absolute bottom-5 left-8 text-text-faint')}>
        CF // {phase === 'greeting' ? 'Seq 01 · Ident' : 'Seq 02 · Assembly'}
      </span>
    </div>
  );
}

function Greeting({
  name,
  onAnimationComplete,
}: {
  name: string | null;
  onAnimationComplete: (definition: unknown) => void;
}) {
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center"
      variants={greetingVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      onAnimationComplete={onAnimationComplete}
    >
      <motion.span
        variants={greetingLabelVariants}
        className={cn(MICRO_LABEL, 'flex items-center gap-2 text-text-muted')}
      >
        <span className="cf-welcome-accent size-1.5" />
        Signed in
      </motion.span>

      <p className="flex flex-wrap items-baseline justify-center gap-x-3 text-4xl font-semibold tracking-tight sm:gap-x-4 sm:text-5xl">
        <span className="inline-block overflow-hidden pb-1">
          <motion.span variants={greetingWordVariants} className="inline-block">
            Welcome
          </motion.span>
        </span>
        <span className="inline-block overflow-hidden pb-1">
          <motion.span variants={greetingWordVariants} className="inline-block">
            {name ? 'back,' : 'back'}
          </motion.span>
        </span>
        {name && (
          <span className="cf-welcome-name-glow inline-block overflow-hidden pb-1">
            <motion.span variants={greetingWordVariants} className="relative inline-block">
              <span className="cf-welcome-name-ink">{name}</span>
              <motion.span
                variants={glintVariants}
                style={GLINT_STYLE}
                className="cf-welcome-glint pointer-events-none absolute inset-y-0 left-0 w-1/3 mix-blend-overlay"
              />
            </motion.span>
          </span>
        )}
      </p>

      <motion.span
        variants={greetingRuleVariants}
        className="block h-px w-48 origin-left bg-border-strong"
      />
    </motion.div>
  );
}

/** The workspace wireframe. DOM order below is the snap order. */
function Assembly({ onAnimationComplete }: { onAnimationComplete: (definition: unknown) => void }) {
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0 grid grid-cols-[11rem_minmax(0,1fr)] grid-rows-[3.5rem_auto_minmax(0,1fr)] pb-12 md:grid-cols-[15rem_minmax(0,1fr)]"
      style={FRAME_STYLE}
      variants={assemblyVariants}
      initial="hidden"
      animate="show"
      onAnimationComplete={onAnimationComplete}
    >
      <HudHeader />
      <FocusCell />
      <HudSidebar />
      <HudTable />
      <FindHint />
    </motion.div>
  );
}

function HudHeader() {
  return (
    <motion.div
      variants={headerVariants}
      style={AREA_HEADER}
      className="flex items-center gap-4 border-b border-border-strong bg-surface-card/85 px-5"
    >
      <span className="size-5 bg-surface-inverse" />
      <span className={cn(MICRO_LABEL, 'text-text-default')}>Cycle Forge</span>
      <span className="h-5 w-px bg-border-default" />
      <span className="hidden items-center gap-3 sm:flex">
        <span className="h-1.5 w-14 rounded-full bg-surface-strong" />
        <span className="h-1.5 w-10 rounded-full bg-surface-strong" />
        <span className="h-1.5 w-12 rounded-full bg-surface-strong" />
      </span>
      <span className="ml-auto flex h-8 w-64 items-center gap-2 border border-border-default bg-surface-card px-2.5">
        <Search className="size-3.5 text-text-faint" />
        <span className="h-1.5 w-24 rounded-full bg-surface-strong" />
      </span>
      <span className="flex w-24 items-center justify-end gap-2">
        <span className="h-1.5 w-10 rounded-full bg-surface-strong" />
        <span className="flex size-7 items-center justify-center rounded-full border border-border-strong">
          <span className="cf-welcome-accent size-3 rounded-full" />
        </span>
      </span>
    </motion.div>
  );
}

/** Lighthouse: the primary triage stat cell. Placeholder readout only — no numbers. */
function FocusCell() {
  return (
    <div style={AREA_FOCUS} className="flex justify-center px-4 pt-6">
      <motion.div
        variants={focusCellVariants}
        className="relative w-full max-w-md border border-border-strong bg-surface-card/85 px-5 py-4"
      >
        <motion.span
          variants={focusRingVariants}
          className="pointer-events-none absolute -inset-1.5 border-2 border-border-strong"
        />
        <HudCorners className="-m-px size-2.5 border-2" />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-mono text-role-eyebrow uppercase tracking-widest text-text-default">
            <span className="cf-welcome-accent size-1.5" />
            Triage
          </span>
          <span className={cn(MICRO_LABEL, 'text-text-faint')}>Focus</span>
        </div>
        <motion.div variants={readoutVariants} className="mt-3 flex h-7 items-end gap-1">
          {READOUT_SEGMENTS.map((height, i) => (
            <motion.span
              key={i}
              variants={readoutSegmentVariants}
              className={cn('flex-1 origin-bottom bg-surface-inverse', height)}
            />
          ))}
        </motion.div>
        <div className="mt-3 h-0.5 overflow-hidden bg-surface-sunken">
          <div className="cf-boot-sweep h-full w-1/4 bg-surface-inverse" />
        </div>
      </motion.div>
    </div>
  );
}

function HudSidebar() {
  return (
    <div style={AREA_SIDE} className="min-h-0 py-4 pl-4">
      <motion.div
        variants={sidebarVariants}
        className="flex h-full flex-col gap-1 border border-border-default bg-surface-card/85 p-2"
      >
        <span className={cn(MICRO_LABEL, 'border-b border-border-hairline px-2 pb-2 pt-1 text-text-faint')}>
          Lanes
        </span>
        {SIDEBAR_TABS.map(({ label, icon: Icon }, i) => (
          <motion.span
            key={label}
            variants={sidebarTabVariants}
            className={cn(
              'relative flex h-9 items-center gap-2.5 px-2.5 text-role-nav',
              i === 0 ? 'bg-surface-sunken font-semibold text-text-default' : 'text-text-muted',
            )}
          >
            {i === 0 && <span className="cf-welcome-accent absolute inset-y-1.5 left-0 w-0.5" />}
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}

function HudTable() {
  return (
    <div style={AREA_TABLE} className="min-h-0 p-4 pt-5">
      <motion.div
        variants={tableVariants}
        className="relative h-full overflow-hidden border border-border-default bg-surface-card/85"
      >
        {/* Column guides the rows lock into. */}
        <div className={cn(TABLE_GRID, 'pointer-events-none absolute inset-0 divide-x divide-border-hairline')}>
          {TABLE_COLUMNS.map((column) => (
            <span key={column || 'select'} />
          ))}
        </div>
        <div className={cn(TABLE_GRID, 'relative h-9 items-center border-b border-border-strong')}>
          {TABLE_COLUMNS.map((column) => (
            <span key={column || 'select'} className={cn(MICRO_LABEL, 'px-3 text-text-muted')}>
              {column}
            </span>
          ))}
        </div>
        {TABLE_ROWS.map((cells, r) => (
          <motion.div
            key={r}
            variants={tableRowVariants}
            className={cn(TABLE_GRID, 'relative h-10 items-center border-b border-border-hairline')}
          >
            <span className="px-3">
              <span className="block size-3 border border-border-default" />
            </span>
            {cells.map((width, c) => (
              <span key={c} className="px-3">
                <span className={cn('block h-1.5 rounded-full bg-surface-strong', width)} />
              </span>
            ))}
            <span className="px-3">
              <span className="block h-4 w-10 rounded-full border border-border-default" />
            </span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

/** Mirrors the header's right cluster so the F cap lands inside the search field. */
function FindHint() {
  return (
    <div style={AREA_HEADER} className="pointer-events-none flex items-center justify-end gap-4 px-5">
      <motion.div
        variants={findHintVariants}
        className="relative flex h-8 w-64 origin-right items-center justify-end pr-1"
      >
        <span className="relative inline-flex">
          <span className="cf-welcome-pulse absolute -inset-1 rounded-md border-2 border-border-strong" />
          <KeyboardKey size="sm">F</KeyboardKey>
        </span>
        <span className={cn(MICRO_LABEL, 'absolute right-0 top-full mt-2 flex items-center gap-1.5 text-text-default')}>
          <span className="h-px w-4 bg-border-strong" />
          Find
        </span>
      </motion.div>
      <span className="w-24" />
    </div>
  );
}

function SkipCaption() {
  return (
    <motion.p
      aria-hidden
      className={cn(MICRO_LABEL, 'pointer-events-none absolute inset-x-0 bottom-5 text-center text-text-muted')}
      initial={SKIP_CAPTION_INITIAL}
      animate={SKIP_CAPTION_ANIMATE}
    >
      Press any key to skip
    </motion.p>
  );
}

// ─── Dev replay ──────────────────────────────────────────────────────────────

/** Dev-only fixed bottom-right replay icon button. Renders null when process.env.NODE_ENV === 'production'. */
export function WelcomeReplayButton({ onReplay }: { onReplay: () => void }) {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Replay welcome animation"
      onClick={onReplay}
      // z-toast (2050) is the first layer above z-splash (2000).
      className="fixed bottom-4 right-4 z-toast size-8 rounded-full opacity-40 hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-4"
    >
      <RotateCcw />
    </Button>
  );
}

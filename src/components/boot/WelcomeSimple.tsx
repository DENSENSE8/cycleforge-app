'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { AmbientLayer } from '@/components/boot/welcome/AmbientLayer';
import { ELEVATION, SIMPLE, ms } from '@/components/boot/welcome/motion-grammar';
import { releaseWelcome } from '@/components/boot/welcome/welcome-stage';
import { resolveWelcomeTheme, welcomePaletteStyle, type WelcomeTheme } from '@/components/boot/welcome/welcome-theme';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { useReducedMotion } from '@/design-system/motion';
import { taskDeskQueryOptions } from '@/features/tasks/useTaskDesk';
import {
  WELCOME_AVATAR_RING_CLASS,
  WELCOME_AVATAR_SLOT_CLASS,
  WELCOME_CARD_CLASS,
  WELCOME_CARD_GRAIN_CLASS,
  WELCOME_COLUMN_CLASS,
  WELCOME_FROST_CLASS,
  WELCOME_GROUND_CLASS,
  WELCOME_GROUND_GRAIN_CLASS,
  WELCOME_HEADLINE_CLASS,
  WELCOME_NAME_GLOW_CLASS,
  WELCOME_NAME_INK_CLASS,
  WELCOME_ROOT_CLASS,
  WELCOME_SOFT_LINE_CLASS,
  WELCOME_STAGE_CLASS,
  welcomeStatusText,
  welcomeWeekday,
} from '@/lib/boot-splash-script';
import { readWelcomeThemeOverride } from '@/lib/boot-flag';
import { dailyChecksQueryOptions } from '@/lib/daily-checks/use-daily-checks';
import { getCurrentPSTDateKey } from '@/utils/date';
import { getStaffColorHex } from '@/utils/staff-colors';

const MODIFIER_KEYS: Record<string, true> = { Shift: true, Control: true, Alt: true, Meta: true };

export interface WelcomeSimpleProps {
  onExited: () => void;
  /** The selected dynamic variant mounted and can replace the pre-hydration frame. */
  onMounted: () => void;
  mode?: 'full' | 'minimal';
}

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

function AnimatedWords({ greeting, name, colorized }: { greeting: string; name: string | null; colorized: boolean }) {
  const text = name ? `${greeting}, ${name}` : greeting;
  const words = text.split(/(\s+)/);
  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, index) =>
          /^\s+$/.test(word) ? (
            word
          ) : (
            <motion.span
              key={`${word}-${index}`}
              className={`inline-block ${colorized && name && text.indexOf(word) >= greeting.length ? WELCOME_NAME_INK_CLASS : ''}`}
              initial={{
                opacity: SIMPLE.INITIAL_OPACITY,
                transform: `translate3d(0, ${SIMPLE.RISE_PX}px, 0)`,
              }}
              animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
              transition={{ duration: SIMPLE.ENTER_S, delay: index * SIMPLE.WORD_STAGGER_S }}
            >
              {word}
            </motion.span>
          ),
        )}
      </span>
    </span>
  );
}

export function WelcomeSimple({ onExited, onMounted, mode = 'full' }: WelcomeSimpleProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useStaffColorVersion();
  const reduceMotion = useReducedMotion() ?? false;
  const staffId = user?.staffId ?? null;
  const name = user?.name?.trim() || null;
  const colorHex = getStaffColorHex({ id: staffId });
  const [theme] = useState<WelcomeTheme>(() => resolveWelcomeTheme(new Date(), readWelcomeThemeOverride()));
  const paletteStyle = useMemo(
    () => ({ ...welcomePaletteStyle(theme), '--cf-welcome-name': colorHex }) as CSSProperties,
    [colorHex, theme],
  );
  const [open, setOpen] = useState(true);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const releasedRef = useRef(false);
  const exitedRef = useRef(false);
  const minimal = mode === 'minimal';

  useLayoutEffect(() => {
    onMounted();
  }, [onMounted]);

  const skip = useCallback(() => {
    if (!open) return;
    releasedRef.current = true;
    releaseWelcome({ skipped: true });
    setOpen(false);
  }, [open]);

  useEffect(() => {
    const duration = minimal
      ? ELEVATION.GREET_IN_S + ELEVATION.GREET_HOLD_S
      : SIMPLE.ENTER_S + SIMPLE.HOLD_S;
    const timer = window.setTimeout(() => setOpen(false), ms(duration));
    return () => window.clearTimeout(timer);
  }, [minimal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || MODIFIER_KEYS[event.key]) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      skip();
    };
    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      skip();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [skip]);

  useEffect(() => {
    if (minimal || window.location.pathname !== '/') return;
    const read = () => setOpenCount(readDailyOpenCount(queryClient));
    read();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const head = event.query.queryKey[0];
      if (head === 'daily-checks' || head === 'tasks') read();
    });
  }, [minimal, queryClient]);

  const handleExitComplete = useCallback(() => {
    if (!releasedRef.current) {
      releasedRef.current = true;
      releaseWelcome();
    }
    if (exitedRef.current) return;
    exitedRef.current = true;
    onExited();
  }, [onExited]);

  const enterDuration = minimal ? ELEVATION.GREET_IN_S : SIMPLE.ENTER_S;
  const leaveDuration = minimal ? ELEVATION.GREET_OUT_S : SIMPLE.LEAVE_S;
  const greeting = name ? `${theme.greeting}, ${name}` : theme.greeting;

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open ? (
        <motion.div
          key="welcome-simple"
          role="status"
          aria-live="polite"
          data-welcome-variant={minimal ? 'elevation' : 'simple'}
          className={WELCOME_ROOT_CLASS}
          style={paletteStyle}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            ...(reduceMotion || minimal
              ? {}
              : {
                  transform: `translate3d(0, ${SIMPLE.LEAVE_Y_PX}px, 0) scale(${SIMPLE.LEAVE_SCALE})`,
                }),
          }}
          transition={{ duration: reduceMotion ? 0.2 : leaveDuration }}
        >
          <span className="sr-only">{welcomeStatusText(theme.greeting, name)}</span>
          <div aria-hidden className={WELCOME_GROUND_CLASS}>
            <div className={WELCOME_GROUND_GRAIN_CLASS} />
          </div>
          {!minimal ? <AmbientLayer theme={theme} phase="drift" still={reduceMotion} /> : null}
          <div className={WELCOME_STAGE_CLASS}>
            {minimal ? (
              <motion.p
                data-welcome-elevation-greeting
                aria-label={greeting}
                className={WELCOME_HEADLINE_CLASS}
                initial={{ opacity: ELEVATION.INITIAL_OPACITY }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : enterDuration }}
              >
                {greeting}
              </motion.p>
            ) : (
              <motion.div
                className={`${WELCOME_CARD_CLASS} ${WELCOME_FROST_CLASS}`}
                initial={
                  reduceMotion
                    ? { opacity: SIMPLE.INITIAL_OPACITY }
                    : {
                        opacity: SIMPLE.INITIAL_OPACITY,
                        transform: `translate3d(0, ${SIMPLE.RISE_PX}px, 0)`,
                      }
                }
                animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
                transition={{ duration: reduceMotion ? 0.2 : enterDuration }}
              >
                <div className={WELCOME_CARD_GRAIN_CLASS} />
                <div className={WELCOME_COLUMN_CLASS}>
                  <span className={`${WELCOME_AVATAR_SLOT_CLASS} ${WELCOME_AVATAR_RING_CLASS}`}>
                    <StaffAvatar
                      staffId={staffId}
                      name={name}
                      avatarPhotoId={user?.avatarPhotoId}
                      colorHex={colorHex}
                      size="2xl"
                      ring={false}
                    />
                  </span>
                  <p className={WELCOME_HEADLINE_CLASS}>
                    <span className={WELCOME_NAME_GLOW_CLASS}>
                      {reduceMotion ? (
                        <span>
                          {theme.greeting}
                          {name ? <span className={WELCOME_NAME_INK_CLASS}>{`, ${name}`}</span> : null}
                        </span>
                      ) : (
                        <AnimatedWords greeting={theme.greeting} name={name} colorized />
                      )}
                    </span>
                  </p>
                  <p className={WELCOME_SOFT_LINE_CLASS}>
                    {welcomeWeekday()}
                    {openCount !== null ? ` · ${openCount} open today` : ''}
                  </p>
                </div>
              </motion.div>
            )}
          </div>
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-role-caption text-text-muted">
            Press any key to skip
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

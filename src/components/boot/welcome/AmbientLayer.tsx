'use client';

/**
 * The welcome's ambient layer, animated: the theme's shapes drifting slowly
 * (mirror loops, transform only) and its optional particles falling / rising
 * on linear loops with a sway. `leave` sends shapes outward from the viewport
 * centre while fading; `still` (reduced motion) holds everything at rest, has
 * no particles, and crossfades out. Timing comes only from the motion grammar.
 * Resting geometry is shared with AmbientLayerStatic / BOOT_SPLASH_SCRIPT.
 */
import { motion, type TargetAndTransition, type Transition } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import { drift, enter, exit, fall, reducedMotion, settle } from './motion-grammar';
import {
  WELCOME_AMBIENT_LAYER_CLASS,
  WELCOME_ROLE_COLOR,
  welcomeParticleLayout,
  welcomeShapeClass,
  welcomeShapeStyle,
  type WelcomeParticle,
  type WelcomeParticleSpec,
  type WelcomeShapeSpec,
  type WelcomeTheme,
} from './welcome-theme';

export type AmbientPhase = 'rest' | 'drift' | 'leave';

/** How far (px) a shape travels outward from the viewport centre as it leaves. */
const LEAVE_DISTANCE_PX = 240;
/** Particles cross from just above the viewport to just below it (vh). */
const PARTICLE_ENTRY_VH = -8;
const PARTICLE_EXIT_VH = 108;
/** Side-to-side sways per crossing (a count, not a duration). */
const SWAY_CYCLES_PER_CROSSING = 3;

export function AmbientLayer({ theme, phase, still }: { theme: WelcomeTheme; phase: AmbientPhase; still: boolean }) {
  return (
    <div aria-hidden className={WELCOME_AMBIENT_LAYER_CLASS}>
      {theme.shapes.map((spec, index) => (
        <AmbientShape key={`${theme.id}-${index}`} spec={spec} phase={phase} still={still} />
      ))}
      {!still && theme.particles ? <AmbientParticles key={theme.id} spec={theme.particles} phase={phase} /> : null}
    </div>
  );
}

function AmbientShape({ spec, phase, still }: { spec: WelcomeShapeSpec; phase: AmbientPhase; still: boolean }) {
  let animate: TargetAndTransition;
  let transition: Transition;
  if (still) {
    animate = phase === 'leave' ? { opacity: 0 } : { x: 0, y: 0 };
    transition = reducedMotion.exit;
  } else if (phase === 'drift') {
    animate = {
      x: [0, spec.drift.x],
      y: [0, spec.drift.y],
      ...(spec.drift.rotate ? { rotate: [0, spec.drift.rotate] } : {}),
    };
    transition = drift(spec.drift.periodS);
  } else if (phase === 'leave') {
    // Outward along the ray from the viewport centre through the shape's anchor.
    const dx = spec.anchor.x - 50;
    const dy = spec.anchor.y - 50;
    const length = Math.hypot(dx, dy) || 1;
    animate = { x: (dx / length) * LEAVE_DISTANCE_PX, y: (dy / length) * LEAVE_DISTANCE_PX, opacity: 0 };
    transition = exit;
  } else {
    animate = { x: 0, y: 0, rotate: 0 };
    transition = settle;
  }
  return (
    <motion.div
      className={welcomeShapeClass(spec)}
      style={welcomeShapeStyle(spec) as CSSProperties}
      initial={false}
      animate={animate}
      transition={transition}
    >
      {spec.kind === 'path' && spec.d ? (
        <svg viewBox="0 0 100 100" aria-hidden>
          <path d={spec.d} fill="currentColor" />
        </svg>
      ) : null}
    </motion.div>
  );
}

function AmbientParticles({ spec, phase }: { spec: WelcomeParticleSpec; phase: AmbientPhase }) {
  const particles = useMemo(() => welcomeParticleLayout(spec), [spec]);
  const rising = spec.fallVminPerS < 0;
  const crossingS = (PARTICLE_EXIT_VH - PARTICLE_ENTRY_VH) / Math.max(Math.abs(spec.fallVminPerS), Number.EPSILON);
  return (
    <>
      {particles.map((particle, index) => (
        <AmbientParticle
          key={index}
          kind={spec.kind}
          particle={particle}
          phase={phase}
          rising={rising}
          crossingS={crossingS / particle.speed}
        />
      ))}
    </>
  );
}

function AmbientParticle({
  kind,
  particle,
  phase,
  rising,
  crossingS,
}: {
  kind: WelcomeParticleSpec['kind'];
  particle: WelcomeParticle;
  phase: AmbientPhase;
  rising: boolean;
  crossingS: number;
}) {
  const from = `${rising ? PARTICLE_EXIT_VH : PARTICLE_ENTRY_VH}vh`;
  const to = `${rising ? PARTICLE_ENTRY_VH : PARTICLE_EXIT_VH}vh`;
  // Stable keyframe arrays: leaving only changes opacity, so the loops keep running.
  const loop = useMemo(
    () => ({
      y: [from, to],
      x: [-particle.sway, particle.sway],
      ...(particle.turns ? { rotate: [0, particle.turns * 360] } : {}),
    }),
    [from, to, particle.sway, particle.turns],
  );
  const transition = useMemo<Transition>(() => {
    // Negative delay: each particle starts part-way through its crossing, so the
    // field is already spread across the viewport when the lobby first shows.
    const crossing = fall(crossingS, -particle.delay * crossingS);
    return {
      y: crossing,
      rotate: crossing,
      x: drift((crossingS / SWAY_CYCLES_PER_CROSSING) * 2),
      opacity: phase === 'leave' ? exit : enter,
    };
  }, [crossingS, particle.delay, phase]);
  const animate: TargetAndTransition =
    phase === 'rest' ? { opacity: 0 } : { ...loop, opacity: phase === 'leave' ? 0 : particle.opacity };
  return (
    <motion.span
      className={`cf-welcome-particle cf-welcome-particle--${kind}`}
      style={
        {
          '--particle-x': `${particle.x}%`,
          '--particle-w': `${particle.w}vmin`,
          '--particle-h': `${particle.h}vmin`,
          '--shape-color': WELCOME_ROLE_COLOR[particle.role],
        } as CSSProperties
      }
      initial={{ y: from, x: 0, opacity: 0 }}
      animate={animate}
      transition={transition}
    />
  );
}

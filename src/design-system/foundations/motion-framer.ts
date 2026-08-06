import type { Transition, Variants } from '../motion/framer';
import { fadeInstant, springSnappy } from '../motion/tokens';

/**
 * Cubic-bezier tuples for Framer Motion `ease`.
 * Primary curve matches station / Up Next cards (kinetic ledger rhythm).
 */

export const motionBezier = {
  /** Cards, chevrons, list rows, opacity */
  easeOut: [0.22, 1, 0.36, 1] as const,
  /** Height / layout — softer than easeOut */
  layout: [0.25, 0.1, 0.25, 1] as const,
} as const;

/** Durations in seconds — pair with `motionBezier` */
export const framerDuration = {
  /** Active station order card mount */
  stationCardMount: 0.26,
  /** Up Next list row mount */
  upNextRowMount: 0.18,
  stationChevron: 0.28,
  upNextChevron: 0.2,
  stationCollapseHeight: 0.32,
  stationCollapseOpacity: 0.26,
  upNextCollapseHeight: 0.22,
  upNextCollapseOpacity: 0.14,
  stationSerialRow: 0.22,
  stationAddedBadge: 0.18,
  /**
   * Capture-stack row EXIT — the vacated height collapses as the row fades, so
   * the rows above settle into the gap instead of jumping. Deliberately shorter
   * than the spring mount: a departing ledger line should not hold the eye.
   */
  captureStackRowExit: 0.18,
  /** Capture-stack fresh-arrival ring pulse (one shot, expanded row only) */
  captureStackFreshPulse: 1.8,
  /** Modal scrim fade — aligns with CSS `motionDurations.fast` */
  overlayScrim: 0.15,
  /**
   * Master-nav body swap (the map ⇄ ranked search results) — opacity-only,
   * ≤150ms. Horizontal slide on a 240px push spine is too heavy for repetitive
   * enterprise jumps. Pair with `framerPresence.spineBodySwap`.
   *
   * Was `spineDrill` until 2026-08-02, when the section drill was deleted; the
   * body still swaps between two KINDS of list, which is the same altitude
   * change at the same physics. Renamed rather than deleted-and-recreated —
   * a preset named for a surface that no longer exists is a comment that lies.
   */
  spineBodySwap: 0.12,
  /**
   * Master-nav row cascade step — ONE ladder for drill page rows AND mode rows.
   * 15ms × index: an 8-row section finishes its last row's 120ms mount at
   * 225ms, so the whole list resolves inside a quarter second. The old 40ms
   * step applied only to modes, which made a 6-mode page feel slower than the
   * 12-page section it lived in — the cascade read as lag, not as order.
   */
  spineRowStagger: 0.015,
  /** Master-nav row mount (paired with {@link spineRowStagger}). */
  spineRowMount: 0.12,
  /** Master-nav active page wash settle. */
  spineActiveWash: 0.15,
  /** Table row enter/exit */
  tableRowMount: 0.22,
  /** Sidebar rail CRUD enter/exit — small left slide (scan in / dismiss out) */
  sidebarRailRowMount: 0.2,
  /** Workbench right-pane / detail crossfade */
  workbenchPaneMount: 0.18,
  /**
   * Omnichannel composer dock mount. Equal to {@link workbenchPaneMount} today,
   * and deliberately its own constant rather than a reference: the dock is
   * region-plural chrome (Station Unbox notes + Workbench Support reply), so it
   * must be tunable without retiming every focus-surface swap in the app.
   */
  composerDockMount: 0.18,
  /** Photo viewer details column — one symmetric drawer toggle (open == close reversed) */
  photoContextPanelMount: 0.22,
  /** Nav spine push column — one symmetric width toggle that reflows the frame */
  sidebarNavColumnMount: 0.24,
  /** Global detail-stack overlay card (full-height flyout) — slow, soft enter/exit */
  detailStackOverlayMount: 0.4,
  /**
   * Heavy right-pane WORKSPACE overlay settle (receiving line workspace).
   * Slower + opacity-led than `workbenchPaneMount` — a carton→carton swap is a
   * big subtree, so it dissolves gently rather than snapping.
   */
  workbenchPaneSettle: 0.3,
  /** Station carton→carton swap — scan cadence, enter only (exit is instant) */
  stationCartonSwap: 0.12,
  /** Sidebar section expand/collapse */
  sidebarExpand: 0.26,
  /** Dropdown menu open/close */
  dropdownOpen: 0.18,
  /** Overlay search bar toggle */
  overlaySearchIn: 0.2,
  /** Copy-to-clipboard feedback flash */
  chipCopyFeedback: 0.15,
  /** Station scan-band glow — idle ⇄ focused fade */
  scanBandGlow: 0.2,
  /** Station scan-band glow — submit / click pulse flash */
  scanBandGlowPulse: 0.26,
  /**
   * Procedure Focus Deck layout settle — face height, pull-up margin, peek
   * geometry when the step pointer advances. Soft + slow (Smart Stack notch
   * commit). Single-channel Motion `layout` FLIP — no competing CSS
   * margin/height tween. Pair with crown scrub (transform-only) + `swap.scan`.
   */
  procedureStackLayout: 0.55,
  /** Auth card shell — first paint mount */
  signInCardMount: 0.26,
  /** Email ↔ password step slide (x) */
  signInStepSlide: 0.26,
  /** Email ↔ password step crossfade (opacity) */
  /** Workspace title text swap */
  signInTitle: 0.18,
  /** Identity chip appear on password step */
  signInIdentityChip: 0.18,
  /** Alternate auth methods fade (step change only) */
  signInAlternateFade: 0.18,
  /** AI chat "jump to latest" floating pill — mount/unmount */
  chatScrollToLatest: 0.16,
} as const;

export const framerDurationTabPager = {
  x: 0.32,
  opacity: 0.2,
} as const;

/** Named Framer `transition` presets */
export const framerTransition = {
  stationCardMount: {
    duration: framerDuration.stationCardMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Workbench right-pane / detail crossfade — pair with `framerPresence.workbenchPane` */
  workbenchPaneMount: {
    duration: framerDuration.workbenchPaneMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Omnichannel composer dock mount — pair with `framerPresence.composerDock`.
   *
   * `OmnichannelComposerDock` used to rebuild this inline from
   * `framerDuration.workbenchPaneMount` + `motionBezier.easeOut` and then `void`
   * the pane preset names so a text guard saw them referenced. It is named here
   * instead: the dock is not a focus-surface swap (see the presence docblock),
   * so it owns its own entry rather than borrowing the pane's.
   */
  composerDockMount: {
    duration: framerDuration.composerDockMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Master-nav body swap (map ⇄ results) — pair with `framerPresence.spineBodySwap` */
  spineBodySwap: {
    duration: framerDuration.spineBodySwap,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Master-nav active page wash — pair with `framerPresence.spineActiveWash` */
  spineActiveWash: {
    duration: framerDuration.spineActiveWash,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Photo viewer details drawer — one symmetric width toggle (open == close
   *  reversed); consumed by `PhotoContextPanel` via `useMotionTransition` */
  photoContextPanelMount: {
    duration: framerDuration.photoContextPanelMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Nav spine push column — the left navigator's own width toggle, which
   * reflows the whole content region (`SidebarNavColumn`).
   *
   * A tween, deliberately, where the old slide-OVER used a spring: a spring on a
   * width overshoots past its target, and here the target is the width every
   * sibling lays out against — the workspace would visibly rubber-band on every
   * open. `motionBezier.layout` is the softer curve the house reserves for
   * geometry (see `detailStackOverlayMount` / `sidebarExpand`).
   */
  sidebarNavColumnMount: {
    duration: framerDuration.sidebarNavColumnMount,
    ease: motionBezier.layout,
  } satisfies Transition,

  /**
   * Procedure Focus Deck layout settle — margin pull-up, face height, peek
   * geometry on step pointer advance via Motion `layout` FLIP (transform).
   * Law: `display/motion-crossfade.md` → sanctioned layout #2; role:
   * `motionRole.procedure.advance`. Tween never spring — soft overlap, not snap.
   */
  procedureStackLayout: {
    duration: framerDuration.procedureStackLayout,
    ease: motionBezier.layout,
  } satisfies Transition,

  /** Detail-stack overlay card — pair with `framerPresence.detailStackOverlay` */
  detailStackOverlayMount: {
    duration: framerDuration.detailStackOverlayMount,
    // Softer curve than easeOut so the full-height panel eases open/shut gently.
    ease: motionBezier.layout,
  } satisfies Transition,

  /**
   * Heavy right-pane WORKSPACE overlay crossfade (receiving line workspace) — a
   * slower, opacity-led settle. Pair with `framerPresence.workbenchPaneSettle`;
   * consume through `useMotionTransition` so reduced-motion collapses it.
   */
  workbenchPaneSettle: {
    duration: framerDuration.workbenchPaneSettle,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Station carton→carton swap (scan cadence). The ENTER half only — the exit
   * is zero-duration via `framerPresence.stationCartonSwap`, so `mode="wait"`
   * introduces no empty-canvas gap between two physically different boxes.
   * Pair with `framerPresence.stationCartonSwap`; consume through
   * `useMotionTransition`. See `display/motion-crossfade.md`.
   */
  stationCartonSwapMount: {
    duration: framerDuration.stationCartonSwap,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Procedure Focus Deck evidence body — short opacity enter/exit under
   * `procedure.advance`. Distinct from carton `swap.scan` (exit:0).
   */
  procedureFocusBodyMount: {
    duration: framerDuration.stationCartonSwap,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  upNextRowMount: {
    duration: framerDuration.upNextRowMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  stationChevron: {
    type: 'tween' as const,
    duration: framerDuration.stationChevron,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  upNextChevron: {
    type: 'tween' as const,
    duration: framerDuration.upNextChevron,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Height + opacity synced for expand/collapse (active order panel).
   * Height uses `springSnappy` (utilitarian settle); opacity uses `fadeInstant`.
   */
  stationCollapse: {
    height: springSnappy,
    opacity: fadeInstant,
  } satisfies Transition,

  /** Up Next expanded block — same utilitarian height + instant opacity */
  upNextCollapse: {
    height: springSnappy,
    opacity: fadeInstant,
  } satisfies Transition,

  stationSerialRow: {
    type: 'tween' as const,
    duration: framerDuration.stationSerialRow,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Capture-stack row push-up. A SPRING, not a tween, and deliberately so: rows
   * arrive at scan cadence and every arrival reflows its siblings under
   * `layout="position"`, which is a physical settle rather than a discrete view
   * swap. Physics = `springSnappy` (house utilitarian spring). Pair with
   * `framerPresence.captureStackRow*`.
   */
  captureStackRowMount: springSnappy,

  /**
   * Capture-stack fresh-arrival ring pulse. Suppressed outright under reduced
   * motion (a decorative attention pulse is exactly what 2.3.3 removes), so this
   * never routes through the bridge.
   */
  captureStackFreshPulse: {
    type: 'tween' as const,
    duration: framerDuration.captureStackFreshPulse,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  stationAddedBadge: {
    type: 'tween' as const,
    duration: framerDuration.stationAddedBadge,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Work order assignment overlay backdrop — opacity only */
  overlayScrim: fadeInstant,

  /** Centered assignment modal shell — `springSnappy` */
  workOrderModalSpring: springSnappy,

  /**
   * ⌘K command palette dialog — top-anchored slide-down (negative y), unlike
   * centered `workOrderModalSpring` which rises from below. Pair with
   * `framerPresence.commandBarDialog`. Physics = `springSnappy`.
   */
  commandBarDialog: springSnappy,

  /** Horizontal slide between rows inside the modal — `springSnappy` */
  workOrderSlideSpring: springSnappy,

  /** Table row enter/exit */
  tableRowMount: {
    duration: framerDuration.tableRowMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Sidebar recent-activity rail — scan-in / dismiss-out left slide */
  sidebarRailRowMount: {
    duration: framerDuration.sidebarRailRowMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Sidebar expandable section height + opacity — utilitarian spring + fade */
  sidebarExpand: {
    height: springSnappy,
    opacity: fadeInstant,
  } satisfies Transition,

  /** Dropdown menu open/close */
  dropdownOpen: {
    duration: framerDuration.dropdownOpen,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Overlay search bar toggle */
  overlaySearchIn: {
    duration: framerDuration.overlaySearchIn,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Media-library thumbnail → fullscreen viewer hero morph (`layoutId`-driven).
   * Spring with no overshoot — same rationale as `viewerPaging`: a bounce on a
   * photo's own edges reads as tacky. Only ever pairs a grid tile with the
   * viewer's *first* shown image (see PhotoViewerModal) — never used for
   * in-viewer prev/next, which stays a plain crossfade.
   */
  photoHeroMorph: {
    type: 'spring' as const,
    visualDuration: 0.45,
    bounce: 0,
  } satisfies Transition,

  /** Copy feedback flash — opacity-only `fadeInstant` */
  chipCopyFeedback: fadeInstant,

  /**
   * Station scan-band glow — idle ⇄ focused opacity. Pair with
   * `scanBandGlowOpacity` + `useMotionTransition`. Opacity only (GPU).
   */
  scanBandGlow: {
    duration: framerDuration.scanBandGlow,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Station scan-band glow — submit / armed-click pulse. Keyframe opacity
   * flash then settle. Pair with `useMotionTransition`.
   */
  scanBandGlowPulse: {
    duration: framerDuration.scanBandGlowPulse,
    ease: motionBezier.easeOut,
    times: [0, 0.4, 1],
  } satisfies Transition,

  /** Auth card shell mount — pair with `framerPresence.signInCard` */
  signInCardMount: {
    duration: framerDuration.signInCardMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Auth email ↔ password step crossfade — whole panel (chip + fields) swaps as
   * one unit inside a fixed-height viewport. Pair with `signInStepVariants` and
   * `AnimatePresence mode="wait" initial={false}`.
   */
  signInStepSlide: {
    duration: framerDuration.signInStepSlide,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Workspace title swap — pair with `framerPresence.signInTitle` */
  signInTitle: {
    duration: framerDuration.signInTitle,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Identity chip on password step — pair with `framerPresence.signInIdentityChip` */
  signInIdentityChip: {
    duration: framerDuration.signInIdentityChip,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Alternate auth section fade — pair with `framerPresence.signInAlternateSection` */
  signInAlternateFade: {
    duration: framerDuration.signInAlternateFade,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** AI chat "jump to latest" floating pill — pair with `framerPresence.chatScrollToLatest` */
  chatScrollToLatestMount: {
    duration: framerDuration.chatScrollToLatest,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Horizontal tab pager — x slide + opacity crossfade */
  tabPager: {
    x: { type: 'tween' as const, duration: framerDurationTabPager.x, ease: [0.32, 0.72, 0, 1] as const },
    opacity: { duration: framerDurationTabPager.opacity, ease: 'easeOut' as const },
  } satisfies Transition,

  /** Reduced-motion fallback for tab pager */
  tabPagerReduced: {
    x: { type: 'tween' as const, duration: 0.01, ease: [0.32, 0.72, 0, 1] as const },
    opacity: { duration: 0.01, ease: 'easeOut' as const },
  } satisfies Transition,

  /** Assignment body row change — opacity only (keeps tech/packer from sliding on X). */
  workOrderBodyCrossfade: {
    duration: 0.14,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /**
   * Assignment title block — height/position layout from bottom edge (`transformOrigin: bottom center`)
   * so multi-line titles feel like they grow upward; pair with `LayoutGroup` scoped to the title only.
   * Physics = `springSnappy`.
   */
  workOrderTitleLayoutSpring: springSnappy,

  /** Collapsible card/section expansion — `springSnappy` (same house spring as DenseRowReveal) */
  cardExpansion: springSnappy,

  /** Sliding indicator on horizontal tab/button sliders — `springSnappy` */
  sliderIndicator: springSnappy,

  /** Bumping animated numeric quantities (FBA qty, counts, badges) — `springSnappy` */
  quantityBump: springSnappy,

  /**
   * Swimlane board column reflow — lanes slide into new grid slots when toggling
   * 1-up / 2-up / 3-up. No bounce (ops dashboard); pair with `layout` on bubbles.
   * Physics = `springSnappy`.
   */
  boardLaneLayout: springSnappy,

  /** Table chip columns (platform / order id / tracking) reflow when toggling visibility */
  chipColumnLayout: springSnappy,

  /**
   * Title row swap + layout — `layout` for line-wrap; opacity/y for keyed row changes.
   * Footer stays outside `LayoutGroup` / `AnimatePresence` so it does not crossfade or layout-shift.
   * Springs = `springSnappy`; opacity = `fadeInstant`.
   */
  workOrderAssignmentTitleBlock: {
    layout: springSnappy,
    opacity: fadeInstant,
    y: springSnappy,
  } satisfies Transition,
} as const;

/**
 * Common `initial` / `animate` / `exit` shapes for `motion.*` + `AnimatePresence`.
 * Use: `initial={presets.stationCard.initial}` etc.
 */
export const framerPresence = {
  stationCard: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  },
  upNextRow: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  },
  collapseHeight: {
    initial: { height: 0, opacity: 0 },
    animate: { height: 'auto', opacity: 1 },
    exit: { height: 0, opacity: 0 },
  },
  stationSerialRow: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  },
  /**
   * Capture-stack rows — two shapes, one per row variant.
   *
   * The EXPANDED row is the current task: it rises further and scales in, so a
   * new active card reads as arriving. A COLLAPSED ledger line only slides up —
   * it is history, and history must not compete with the task above the input.
   *
   * `exit` carries its OWN transition deliberately. The mount is a spring, but a
   * departing row should collapse its vacated height on a short fixed tween so
   * the gap closes predictably instead of settling. Under reduced motion the
   * bridge strips y/scale and the `MotionConfig` floor snaps `height` (a
   * positional key), leaving the house-correct reduced form — an opacity
   * crossfade, not a hard cut.
   */
  captureStackRowExpanded: {
    initial: { opacity: 0, y: 24, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: {
      opacity: 0,
      height: 0,
      transition: { duration: framerDuration.captureStackRowExit },
    },
  },
  captureStackRowCollapsed: {
    initial: { opacity: 0, y: 10, scale: 1 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: {
      opacity: 0,
      height: 0,
      transition: { duration: framerDuration.captureStackRowExit },
    },
  },
  /** Capture-stack fresh-arrival ring pulse — one shot, no exit. */
  captureStackFreshPulse: {
    initial: { opacity: 0.55, scale: 1 },
    animate: { opacity: 0, scale: 1.04 },
  },
  stationAddedBadge: {
    initial: { opacity: 0, x: 6 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 4 },
  },
  /** Table row enter/exit — opacity + small y so expand/collapse (Show more)
   *  reads as rows joining the list, not a hard pop. Pair with row `layout`
   *  so siblings reflow with chip-column toggles (ChipColumns already layouts). */
  tableRow: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  },
  /**
   * Sidebar rail CRUD presence — scan slides in from the left, dismiss slides
   * back out to the left (`x: -12`, not −20, so overflow-x clip stays calm).
   * Pair with `framerTransition.sidebarRailRowMount` + `useMotionPresence`.
   */
  sidebarRailRow: {
    initial: { opacity: 0, x: -12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 },
  },
  /** Dropdown panel — fade + slight slide from top */
  dropdownPanel: {
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  },
  /** Sidebar section — height expand/collapse */
  sidebarSection: {
    initial: { height: 0, opacity: 0 },
    animate: { height: 'auto' as const, opacity: 1 },
    exit: { height: 0, opacity: 0 },
  },
  workOrderScrim: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  workOrderModal: {
    initial: { opacity: 0, scale: 0.94, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.94, y: 8 },
  },
  /**
   * ⌘K command palette dialog — top-anchored (y: -8). Pair with
   * `framerTransition.commandBarDialog`. Reduced-motion callers strip
   * transform (opacity-only) at the consumer.
   */
  commandBarDialog: {
    initial: { opacity: 0, scale: 0.96, y: -8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: -8 },
  },
  /** Inline status / feedback message — fade + slight slide from top */
  statusMessage: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  },
  /**
   * Workbench right-pane / detail crossfade — the canonical transition when a
   * selected record's detail pane swaps (the LIST stays put; only the pane
   * crossfades). Opacity + small y. Consume via `useMotionPresence(...)` so
   * `prefers-reduced-motion` collapses it to opacity-only automatically — never
   * hand-branch on reduced motion at the call site. See
   * `.claude/rules/display/motion-crossfade.md`.
   */
  workbenchPane: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  },
  /**
   * Omnichannel composer dock mount — the "type a message here" shell arriving
   * with its host surface. Single primitive consumer:
   * `OmnichannelComposerDock` (Unbox carton notes · Support ticket reply).
   *
   * WHY THIS IS NOT `motionRole.swap.focus` / `workbenchPane`. Two reasons, and
   * the second is the decisive one:
   *
   *   1. It is a CARD MOUNT, not a focus-surface swap. No consumer wraps the
   *      dock in its own `AnimatePresence` keyed on a selection — it enters when
   *      its host surface enters. Enter travel is therefore the house card-mount
   *      idiom (`y: 8`, same as `stationCard` / `signInCard`), not the pane's 6.
   *   2. The dock is REGION-PLURAL. It renders on the Unbox **station** bench
   *      and in the Support **workbench** thread from one shell, and no role
   *      spans both: `swap.focus` is declared `workbench | monitor | canvas`,
   *      and `swap.scan` is scan-cadence with a zero-duration exit. Adopting
   *      either would put a documented out-of-contract region on half the
   *      call sites — a false intent claim, which is exactly why
   *      `motionRole.feedback.pulse` — PoLineRow match acknowledgement.
   *
   * The exit drifts DOWN (`y: 4`), toward the edge the dock sits on — same
   * reasoning as {@link chatScrollToLatest}, and deliberately opposite to
   * `workbenchPane`'s upward lift (which clears the way for the next pane to
   * rise in). Pair with `framerTransition.composerDockMount`; consume via
   * `useMotionPresence` / `useMotionTransition`.
   */
  composerDock: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  },
  /**
   * AI chat "jump to latest" floating pill — rises from just below its rest
   * position (mirrors `statusMessage`, but that one drops from above; this
   * affordance sits at the bottom edge of the scroll port so it rises
   * instead). Single consumer: `AiChatConversation`.
   */
  chatScrollToLatest: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  },
  /**
   * Master-nav body swap — the flat destination map ⇄ the ranked search
   * results. PURE opacity: no x/y on a 240px push spine (fast crossfade or
   * instant; a horizontal slide feels heavy for repetitive ops jumps). Pair
   * with `framerTransition.spineBodySwap`; consume via `useMotionPresence` /
   * `useMotionTransition`.
   *
   * Keyed on the KIND of body, never on the query — typing must update the
   * list in place rather than replay the crossfade on every keystroke.
   */
  spineBodySwap: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /**
   * Master-nav active page wash — soft opacity settle instead of a hard pop.
   * Pair with `framerTransition.spineActiveWash` + `useMotionPresence`.
   */
  spineActiveWash: {
    initial: { opacity: 0.72 },
    animate: { opacity: 1 },
    exit: { opacity: 0.72 },
  },
  /**
   * Global detail-stack overlay — floating card near the top-right edge.
   * Slides IN from the right (translating left into view) and OUT back to the
   * right; opacity + x transform only (GPU-composited). Pair with
   * `framerTransition.detailStackOverlayMount` + `useMotionPresence` (which
   * collapses x→0 under reduced motion, leaving a pure fade).
   */
  detailStackOverlay: {
    initial: { opacity: 0, x: 48 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 48 },
  },
  /**
   * Detail stack in PUSH mode (`RightRailHost` as an in-flow column).
   *
   * Opacity-only, deliberately: the column's own width tween owns arrive and
   * leave, so an `x` translate here — the 48px the overlay preset above uses
   * correctly — would slide the card out of the very slot it just reserved in
   * the flow, leaving a visible empty gutter beside the work surface.
   *
   * Pair with `framerTransition.sidebarNavColumnMount` (the sanctioned push
   * tween, never a spring), exactly as `ContextPanelLayout` does on the left
   * edge. See `.claude/rules/display/motion-crossfade.md` → the deliberate PUSH
   * toggle.
   */
  detailStackPush: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /**
   * Heavy right-pane WORKSPACE overlay crossfade (the receiving line workspace
   * swapping carton→carton). PURE opacity — no y on enter or exit — so two
   * full-bleed heavy panes can never slide in opposite directions (the old
   * double-image jitter); they simply cross-dissolve. The "settle" personality
   * lives one level in, as the panel's staggered card rise
   * (`staggerRevealRiseItem`), so the pane fade and the card rise never compound
   * on the same element. Opacity is GPU-composited, so a big subtree only fades
   * (no per-frame layout). Pair with `framerTransition.workbenchPaneSettle` and
   * consume via `useMotionPresence`. See `.claude/rules/display/motion-crossfade.md`.
   */
  workbenchPaneSettle: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /**
   * Station carton→carton swap — a SIBLING of `workbenchPaneSettle`, not a
   * replacement. The settle preset serves pointer-driven detail swaps (Review,
   * Outbound, FBA, Packer, Triage); this one serves a scanner-driven bench,
   * where the operator has already physically swapped the box and every
   * millisecond of chrome is throughput cost.
   *
   * The exit carries its own zero-duration transition so `mode="wait"` — which
   * must stay, since two absolutely-positioned panes running concurrently
   * double-image — completes the exit immediately and the next carton paints
   * on the following frame. Net: ~0.6s of empty canvas per scan becomes ~0.12s
   * of enter fade, with no gap.
   *
   * Pair with `framerTransition.stationCartonSwapMount`; consume via
   * `useMotionPresence` (which returns a plain opacity shape under reduced
   * motion, where `useMotionTransition` already zeroes the duration).
   */
  stationCartonSwap: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0 } },
  },
  /**
   * Procedure Focus Deck — active evidence body swap on step advance.
   * Opacity-only with a short exit (NOT carton `swap.scan` exit:0) so body
   * height can settle under `procedure.advance` without an instant collapse.
   * Pair with `framerTransition.procedureFocusBodyMount`.
   */
  procedureFocusBody: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /**
   * Auth card shell — subtle opacity + y mount (no scale/blur). B2B auth surfaces
   * stay sub-300ms and transform-only; pair with `framerTransition.signInCardMount`
   * via `useMotionPresence` / `useMotionTransition`.
   */
  signInCard: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  },
  /** Identity chip above password field — opacity only (positioned out of flow) */
  signInIdentityChip: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /** Alternate auth methods block — opacity only (never height on mount) */
  signInAlternateSection: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /** Workspace title text swap */
  signInTitle: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
} as const;

/** Tech / packer grid chips — shared `whileTap` target */
export const framerGesture = {
  tapPress: { scale: 0.9 },
  cardHover: { scale: 1.002, y: -2 },
  rowHover: { x: 2 },
} as const;

/**
 * Station scan-band glow opacity targets — chromatic depth rises from the
 * staff bottom-rule. Quiet at rest; full when focused; pulse on submit.
 * Consume via `ScanBandGlowHost` + `framerTransition.scanBandGlow*`.
 */
export const scanBandGlowOpacity = {
  idle: 0.18,
  focused: 1,
  /** Mid-pulse dip when already focused (keeps a visible flash at opacity 1). */
  pulseDip: 0.42,
} as const;

/**
 * Row-to-row slide inside `WorkOrderAssignmentCard`.
 * Use with `custom={direction}` and `initial="enter" animate="center" exit="exit"`.
 */
export const workOrderAssignmentSlideVariants: Variants = {
  enter: (dir: 'next' | 'prev' | undefined) => ({
    x: dir === 'prev' ? '-55%' : '55%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 'next' | 'prev' | undefined) => ({
    x: dir === 'prev' ? '55%' : '-55%',
    opacity: 0,
  }),
};

/**
 * Tab pager — full-width horizontal swipe.
 * Use with `custom={direction}` (+1 right, -1 left) and `initial="enter" animate="center" exit="exit"`.
 * Pair with `AnimatePresence mode="sync"` inside a single-cell grid so both panels overlap without height glitches.
 */
export const tabPagerVariants: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};

// NOTE: `signInStepVariants` / `signInStepVariantsReduced` were removed when
// /signin stopped swapping panels. Both credential fields now stay mounted and
// the password row reveals via `framerPresence.collapseHeight` — see
// `.claude/rules/display/auth-step-panel.md`.

// ─── Mobile-specific durations ───────────────────────────────────────────────

export const framerDurationMobile = {
  /** Bottom sheet slide up/down */
  sheetSlide: 0.32,
  /** Camera viewfinder enter */
  cameraEnter: 0.28,
  /** Camera viewfinder exit */
  cameraExit: 0.2,
  /** Scan success flash */
  scanSuccess: 0.18,
  /** Scan failure shake */
  scanFailure: 0.4,
  /** FAB mount / unmount */
  fabMount: 0.22,
  /** Bottom nav icon swap */
  navIconSwap: 0.15,
  /** Mobile card mount (slightly slower than desktop for thumb-tracking) */
  mobileCardMount: 0.3,
  /** Photo thumbnail appear */
  photoThumb: 0.2,
  /** Mobile toolbar slide */
  toolbarSlide: 0.22,
  /** Scan confirmation bottom sheet slide up */
  confirmationSlideUp: 0.35,
  /** Search bar expand/collapse in action bar */
  searchExpand: 0.28,
} as const;

// ─── Mobile-specific transitions ─────────────────────────────────────────────

export const framerTransitionMobile = {
  /** Bottom sheet — utilitarian spring settle */
  sheetSlide: springSnappy,

  /**
   * Fullscreen photo viewer paging / dismiss settle — duration-locked spring
   * (visualDuration + bounce: 0), NOT `springSnappy`. Physics springs vary their
   * perceived duration with distance + release velocity; paging must land in the
   * SAME visual time whether the finger barely nudged or hard-flicked. Bounce
   * reads as tacky on a photo. Inherited flick `velocity` (call site) is still
   * respected.
   */
  viewerPaging: {
    type: 'spring' as const,
    visualDuration: 0.32,
    bounce: 0,
  } satisfies Transition,

  /** Camera fullscreen enter — opacity + scale */
  cameraEnter: {
    duration: framerDurationMobile.cameraEnter,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Camera exit — faster for responsiveness */
  cameraExit: {
    duration: framerDurationMobile.cameraExit,
    ease: [0.4, 0, 1, 1] as const,
  } satisfies Transition,

  /** Scan success — quick pulse feedback */
  scanSuccess: {
    duration: framerDurationMobile.scanSuccess,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Scan failure — horizontal shake */
  scanFailure: {
    type: 'spring' as const,
    damping: 12,
    stiffness: 600,
    mass: 0.3,
  } satisfies Transition,

  /** FAB entrance — `springSnappy` */
  fabMount: springSnappy,

  /** Bottom nav active icon crossfade */
  navIconSwap: {
    duration: framerDurationMobile.navIconSwap,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Mobile card mount — slightly softer than desktop */
  mobileCardMount: {
    duration: framerDurationMobile.mobileCardMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Photo thumbnail appear */
  photoThumb: {
    duration: framerDurationMobile.photoThumb,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Mobile toolbar slide in from top */
  toolbarSlide: {
    duration: framerDurationMobile.toolbarSlide,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Scan confirmation bottom sheet — `springSnappy` */
  confirmationSlideUp: springSnappy,

  /** Search bar expand in bottom action bar — `springSnappy` */
  searchExpand: springSnappy,
} as const;

// ─── Mobile-specific presence shapes ─────────────────────────────────────────

export const framerPresenceMobile = {
  /** Bottom sheet — slides up from below viewport */
  sheet: {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
  },
  /** Camera overlay — fades + scales from center */
  camera: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  /** Scan success pulse — scale bounce */
  scanSuccess: {
    initial: { scale: 1 },
    animate: { scale: [1, 1.08, 1] },
  },
  /** Scan failure shake — horizontal displacement */
  scanFailure: {
    initial: { x: 0 },
    animate: { x: [0, -8, 8, -5, 5, 0] },
  },
  /** FAB — scales up from nothing */
  fab: {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.6 },
  },
  /** Mobile card — slides up slightly more than desktop */
  mobileCard: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
  /** Photo thumbnail grid appear */
  photoThumb: {
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.85 },
  },
  /** Toolbar slide from top */
  toolbar: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
  /** Scan confirmation — slides up from below viewport */
  confirmation: {
    initial: { y: '100%', opacity: 0.8 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  },
  /** Search input expand — width + opacity */
  searchInput: {
    initial: { width: 0, opacity: 0 },
    animate: { width: 'auto', opacity: 1 },
    exit: { width: 0, opacity: 0 },
  },
} as const;

/** Optional variants API — `initial="initial" animate="animate" exit="exit"` */
export const framerVariants: Record<string, Variants> = {
  stationCard: {
    initial: framerPresence.stationCard.initial,
    animate: framerPresence.stationCard.animate,
    exit: framerPresence.stationCard.exit,
  },
  upNextRow: {
    initial: framerPresence.upNextRow.initial,
    animate: framerPresence.upNextRow.animate,
    exit: framerPresence.upNextRow.exit,
  },
  collapseHeight: {
    initial: framerPresence.collapseHeight.initial,
    animate: framerPresence.collapseHeight.animate,
    exit: framerPresence.collapseHeight.exit,
  },
  stationSerialRow: {
    initial: framerPresence.stationSerialRow.initial,
    animate: framerPresence.stationSerialRow.animate,
    exit: framerPresence.stationSerialRow.exit,
  },
  stationAddedBadge: {
    initial: framerPresence.stationAddedBadge.initial,
    animate: framerPresence.stationAddedBadge.animate,
    exit: framerPresence.stationAddedBadge.exit,
  },
  tableRow: {
    initial: framerPresence.tableRow.initial,
    animate: framerPresence.tableRow.animate,
    exit: framerPresence.tableRow.exit,
  },
  dropdownPanel: {
    initial: framerPresence.dropdownPanel.initial,
    animate: framerPresence.dropdownPanel.animate,
    exit: framerPresence.dropdownPanel.exit,
  },
  sidebarSection: {
    initial: framerPresence.sidebarSection.initial,
    animate: framerPresence.sidebarSection.animate,
    exit: framerPresence.sidebarSection.exit,
  },
  staggeredList: {
    animate: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  },
  /**
   * Monitor first-load stagger. Parent: `initial="hidden" animate="visible"`.
   * Children (SectionCard / KpiStrip with `stagger`): use `monitorStaggerItem`.
   * Do not remount the container on filter keystrokes — re-render in place.
   */
  monitorStaggerContainer: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  },
  monitorStaggerItem: {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: framerDuration.stationCardMount,
        ease: motionBezier.easeOut,
      },
    },
  },
  /**
   * Master-nav row cascade — ONE ladder for BOTH drill page rows and the mode
   * rows nested under them. Two different steps for two altitudes of the same
   * list read as two different systems; 15ms × index resolves an 8-row section
   * at 225ms and a 4-mode page at 165ms, so both feel like one motion.
   *
   * Parent: `initial={staggerInitial} animate="visible"` and a `key` bound to
   * the SECTION id — never to the filter query or the filtered array. Typing in
   * the drill filter must update rows in place; a container that remounts per
   * keystroke replays the whole cascade under the operator's cursor. Pass
   * `initial={false}` while a filter is active so rows that mount mid-type
   * inherit `visible` instead of fading in one at a time.
   *
   * `y: 2` is the entire travel — under the `MotionConfig` reduced-motion floor
   * the transform snaps and the opacity fade survives, which is the correct
   * reduced form (crossfade, not cut).
   */
  spineRowStaggerContainer: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: framerDuration.spineRowStagger,
      },
    },
  },
  spineRowStaggerItem: {
    hidden: { opacity: 0, y: 2 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: framerDuration.spineRowMount,
        ease: motionBezier.easeOut,
      },
    },
  },
};

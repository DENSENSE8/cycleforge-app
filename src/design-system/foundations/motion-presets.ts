import type { Transition, Variants } from '../motion/framer';
import { fadeInstant, springArmedTrack, springSnappy } from '../motion/tokens';

/**
 * Cubic-bezier tuples for Framer Motion `ease`.
 * Primary curve matches station / Up Next cards (kinetic ledger rhythm).
 */

export const motionBezier = {
  /** Cards, chevrons, list rows, opacity */
  easeOut: [0.22, 1, 0.36, 1] as const,
  /** Height / layout — softer than easeOut */
  layout: [0.25, 0.1, 0.25, 1] as const,
  /** Slow in, slow out — edge-mark traveler */
  easeInOut: [0.42, 0, 0.58, 1] as const,
};

/** Durations in seconds — pair with `motionBezier` */
export const framerDuration = {
  /** Active station order card mount */
  stationCardMount: 0.26,
  /** Up Next list row mount */
  upNextRowMount: 0.18,
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
  /** Slot-table edge-mark 1px traveler — slow ease-in-out bob. */
  edgeMarkPulse: 4.2,
  /** Modal scrim fade — aligns with CSS `motionDurations.fast` */
  overlayScrim: 0.15,
  /** Progress-meter fill settle — a VALUE changed, so it is a state transition and takes the shortest token the house ships… */
  progressFill: 0.1,
  /* `spineBodySwap` (0.12) is DELETED (2026-08-08) with its presence + transition twins. */
  /** Master-nav row cascade step — ONE ladder for drill page rows AND mode rows. */
  spineRowStagger: 0.015,
  /** Master-nav row mount (paired with {@link spineRowStagger}). */
  spineRowMount: 0.12,
  /* `spineActiveWash` (0.15) is DELETED (2026-08-08). */
  /** Table row enter/exit */
  tableRowMount: 0.22,
  /** Sidebar rail CRUD enter/exit — small left slide (scan in / dismiss out) */
  sidebarRailRowMount: 0.2,
  /** Workbench right-pane / detail crossfade */
  workbenchPaneMount: 0.18,
  /** Omnichannel composer dock mount. */
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
  /** Armed-list leaf-commit hit-marker — opacity / inset-rail / micro-scale acknowledge. */
  hitMarker: 0.1,
  /** Live VALUE change on a collection row — a status chip whose fact was changed by someone else (a scan at another station, an Ably push)… */
  liveValueChange: 0.42,
  /** Armed-list ↑↓ selection geometry — binary cut (one frame). */
  armedSnap: 0,
  /** Station scan-band glow — idle ⇄ focused fade */
  scanBandGlow: 0.2,
  /** Station scan-band glow — submit / click pulse flash */
  scanBandGlowPulse: 0.26,
  /** Procedure Focus Deck layout settle — face height, pull-up margin, peek geometry when the step pointer advances. */
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

const framerDurationTabPager = {
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
   * Route history / desk table surface mount — pair with
   * `framerPresence.routeHistory`. House utilitarian spring (no bounce); never
   * invent stiffness/damping at the call site.
   */
  routeHistoryMount: springSnappy,

  /** Omnichannel composer dock mount — pair with `framerPresence.composerDock`. */
  composerDockMount: {
    duration: framerDuration.composerDockMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /* `spineBodySwap` deleted 2026-08-08 — see `framerDuration`. */

  /* `spineActiveWash` deleted 2026-08-08 — see `framerDuration`. */

  /** Photo viewer details drawer — one symmetric width toggle (open == close
   *  reversed); consumed by `PhotoContextPanel` via `useMotionTransition` */
  photoContextPanelMount: {
    duration: framerDuration.photoContextPanelMount,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Nav spine push column — the left navigator's own width toggle, which reflows the whole content region (`SidebarNavColumn`). */
  sidebarNavColumnMount: {
    duration: framerDuration.sidebarNavColumnMount,
    ease: motionBezier.layout,
  } satisfies Transition,

  /** Procedure Focus Deck layout settle — margin pull-up, face height, peek geometry on step pointer advance via Motion `layout` FLIP… */
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
   * Split record pane arriving beside the list (`DeskRecordPlane`, triage) —
   * the house utilitarian spring, no bounce. Pair with
   * `framerPresence.detailStackOverlay` through `motionRole.record.pane`.
   */
  recordPaneMount: springSnappy,

  /**
   * Heavy right-pane WORKSPACE overlay crossfade (receiving line workspace) — a
   * slower, opacity-led settle. Pair with `framerPresence.workbenchPaneSettle`;
   * consume through `useMotionTransition` so reduced-motion collapses it.
   */
  workbenchPaneSettle: {
    duration: framerDuration.workbenchPaneSettle,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Station carton→carton swap (scan cadence). */
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

  /** Welded peel-up hinge — pair with `framerPresence.weldedPanelPeel`. */
  weldedPanelPeel: {
    height: springSnappy,
    rotateX: springSnappy,
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

  /** Capture-stack row push-up. */
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

  /**
   * MasterNav collapsed hover-peek — scale from the top-left origin.
   * Physics = `springSnappy`. Pair with `framerPresence.navPeekCorner`.
   */
  navPeekCorner: springSnappy,

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

  /** Media-library thumbnail → fullscreen viewer hero morph (`layoutId`-driven). */
  photoHeroMorph: {
    type: 'spring' as const,
    visualDuration: 0.45,
    bounce: 0,
  } satisfies Transition,

  /** Copy feedback flash — opacity-only `fadeInstant` */
  chipCopyFeedback: fadeInstant,

  /**
   * Armed-list leaf-commit hit-marker — tween, not spring. Host drives opacity
   * / rail ink / optional lead micro-scale; this owns the decay curve only.
   * Pair with `motionRole.feedback.hitMarker`. Never inline stiffness here.
   */
  hitMarker: {
    duration: framerDuration.hitMarker,
    ease: motionBezier.easeOut,
  } satisfies Transition,

  /** Armed-list ↑↓ geometry snap — lead nudge `x` + traveling `layoutId` marker. */
  armedSnap: {
    type: 'tween' as const,
    duration: framerDuration.armedSnap,
  } satisfies Transition,

  /** Armed-list traveling track / underline — Shared Layout FLIP via `layoutId`. */
  armedTrack: springArmedTrack,

  /**
   * Boxed-off selection pulse — absolute inset border overlay that scales +
   * fades on opacity/transform only (no layout reflow). One-shot on arm /
   * commit; remount via `key`. Never animate the row's own border.
   */
  selectionPulse: {
    duration: 0.35,
    ease: [0, 0, 0.2, 1] as const,
  } satisfies Transition,

  /** Live VALUE change on a collection row — the "attention pulse & morph" a status chip runs when its fact was changed remotely. */
  liveValueChange: {
    type: 'tween' as const,
    duration: framerDuration.liveValueChange,
    times: [0, 0.14, 0.3, 0.45, 0.62, 1],
    ease: 'easeOut' as const,
  } satisfies Transition,

  /** The label half of {@link liveValueChange} — the MORPH. */
  liveValueMorph: {
    type: 'tween' as const,
    duration: 0.18,
    times: [0, 0.45, 1],
    ease: motionBezier.easeOut,
  } satisfies Transition,

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

  /**
   * Slot-table edge-mark 1px traveler — slow ease-in-out bob with a trail.
   * Transform-only (`y`). Pair with {@link CompoundEdgeRail} when `edgeMark.pulse`.
   */
  edgeMarkPulse: {
    duration: framerDuration.edgeMarkPulse,
    ease: motionBezier.easeInOut,
    repeat: Infinity,
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
  /** Peel-up hinge — a panel WELDED to the top edge of the surface below it (the Unbox receive feedback panel over the notes composer). */
  weldedPanelPeel: {
    initial: { height: 0, opacity: 0, rotateX: -15, transformPerspective: 900 },
    animate: { height: 'auto', opacity: 1, rotateX: 0, transformPerspective: 900 },
    exit: { height: 0, opacity: 0, rotateX: -15, transformPerspective: 900 },
  },
  stationSerialRow: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  },
  /** Capture-stack rows — two shapes, one per row variant. */
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
  /**
   * Collapsed MasterNav hover-peek — grows from the top-left corner.
   * Host MUST pin `style.transformOrigin: '0 0'`. Pair with
   * `framerTransition.navPeekCorner`. No `x`/`y`.
   */
  navPeekCorner: {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.92 },
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
  /** Workbench right-pane / detail crossfade — the canonical transition when a selected record's detail pane swaps (the LIST stays put; only… */
  workbenchPane: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  },
  /** Route history / desk TABLE surface first paint — rises into place (opacity + y). */
  routeHistory: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  },
  /** Omnichannel composer dock mount — the "type a message here" shell arriving with its host surface. */
  composerDock: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  },
  /** AI chat "jump to latest" floating pill — rises from just below its rest position (mirrors `statusMessage`, but that one drops from… */
  chatScrollToLatest: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  },
  /* `spineBodySwap` deleted 2026-08-08 — see `framerDuration`. */
  /* `spineActiveWash` deleted 2026-08-08 — see `framerDuration`. */
  /** Global detail-stack overlay — floating card near the top-right edge. */
  detailStackOverlay: {
    initial: { opacity: 0, x: 48 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 48 },
  },
  /** Detail stack in PUSH mode (`RightRailHost` as an in-flow column). */
  detailStackPush: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /** Heavy right-pane WORKSPACE overlay crossfade (the receiving line workspace swapping carton→carton). */
  workbenchPaneSettle: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /** Station carton→carton swap — a SIBLING of `workbenchPaneSettle`, not a replacement. */
  stationCartonSwap: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0 } },
  },
  /** Procedure Focus Deck — active evidence body swap on step advance. */
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
const workOrderAssignmentSlideVariants: Variants = {
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
const tabPagerVariants: Variants = {
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

// ─── Mobile-specific durations ───────────────────────────────────────────────

const framerDurationMobile = {
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

  /** Fullscreen photo viewer paging / dismiss settle — duration-locked spring (visualDuration + bounce: */
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
  navPeekCorner: {
    initial: framerPresence.navPeekCorner.initial,
    animate: framerPresence.navPeekCorner.animate,
    exit: framerPresence.navPeekCorner.exit,
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
  /** Master-nav row cascade — ONE ladder for BOTH drill page rows and the mode rows nested under them. */
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

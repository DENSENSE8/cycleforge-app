import plugin from "tailwindcss/plugin";
// NOTE: this config file is itself `.mjs`, not `.ts`. Tailwind's config
// loader runs under plain Node with no "type": "module" in package.json, so
// a `.ts` file containing ESM `import` syntax triggers Node's
// MODULE_TYPELESS_PACKAGE_JSON reparsing warning (perf overhead + build
// noise) on every dev-server request. `.mjs` is unambiguous ESM to Node, so
// no reparse guess is needed. Same reasoning applies one level down to the
// values modules this file imports — `.mjs` twins, never their `.ts`
// counterparts. Turbopack dev also resolves `.mjs` cleanly here. Values +
// types SoT pairs: `src/design-system/tokens/z-index.mjs` + `z-index.ts`,
// `spacing.mjs` + `spacing.ts`.
import { zIndex } from "./src/design-system/tokens/z-index.mjs";
import { spacingScale } from "./src/design-system/tokens/spacing.mjs";

// Expose the centralized z-index scale as semantic Tailwind utilities
// (z-panel, z-modal, z-popover, z-toast, z-tooltip, …) so components stop
// reaching for arbitrary z-[NNN] values. Maps numeric tokens → string scale.
const zIndexScale = Object.fromEntries(
    Object.entries(zIndex).map(([name, value]) => [name, String(value)]),
);

/**
 * Theme-registry colors are plain `var(--ds-…)` strings.
 * Tailwind v4 applies `/opacity` via color-mix natively — the v3 `themed()`
 * function-color helper is unsupported under `@config` and must not return.
 */

const config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/design-system/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
        // src/lib holds styling SoTs (e.g. outbound-state.ts's status dot/pill
        // classes). Without this, classes used ONLY here (e.g. orphan's color)
        // are never generated and render invisible.
        "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    // CF Type roles ship available for adoption even before every call site
    // uses them (search-and-dense-ui-refactor plan §2.5). Additive: no visual
    // change until a component opts in.
    safelist: [
        'text-role-display',
        'text-role-title',
        'text-role-body',
        'text-role-data',
        'text-role-nav',
        'text-role-caption',
        'text-role-eyebrow',
        'text-role-micro',
        // Spacing intents (spacing-token-leakage plan Phase 2.3) — same
        // ship-before-adoption treatment as the type roles above.
        'inset-chip',
        'inset-field',
        'inset-cozy',
        'inset-card',
        'inset-empty',
        'stack-tight',
        'stack-row',
        'stack-section',
        'row-gap',
        'row-tight',
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                // Dynamic Staff Accent Theme:
                'accent-bg': 'var(--ds-color-accent-bg)',
                'accent-hover': 'var(--ds-color-accent-hover)',
                'accent-light': 'var(--ds-color-accent-light)',
                'accent-border': 'var(--ds-color-accent-border)',
                'accent-text': 'var(--ds-color-accent-text)',
                'accent-shadow': 'var(--ds-color-accent-shadow)',
                // USAV brand navy
                navy: {
                    50:  '#f0f4fb',
                    100: '#dde6f5',
                    200: '#bacbeb',
                    300: '#8ca7db',
                    400: '#5b7fc8',
                    500: '#3a60b5',
                    600: '#2a4d9a',
                    700: '#1a3a6b',
                    800: '#0f1f3d',
                    900: '#0c1b33',
                },
                // Semantic aliases bound to design-system CSS variables.
                // Dark mode swaps via [data-theme='dark'] in globals.css.
                // Convention: the color key carries the role prefix, so usage
                // doubles it — `text-text-default`, `bg-surface-canvas`,
                // `border-border-soft`. Keeps neutral + functional families
                // symmetric. CSS vars are curated in src/styles/globals.css.
                'text-default': 'var(--ds-color-text-primary)',
                'text-muted': 'var(--ds-color-text-secondary)',
                'text-soft': 'var(--ds-color-text-soft)',
                'text-faint': 'var(--ds-color-text-faint)',
                'surface-canvas': 'var(--ds-color-background-canvas)',
                'surface-card': 'var(--ds-color-background-surface)',
                'surface-sunken': 'var(--ds-color-surface-sunken)',
                // Interaction wash (row hover) — lighter than card on dark,
                // canvas-toned on light. The codemod target for hover:bg-gray-50.
                'surface-hover': 'var(--ds-color-surface-hover)',
                // Tracks / skeletons / avatar placeholders (≈ gray-200).
                'surface-strong': 'var(--ds-color-surface-strong)',
                'surface-bench': 'var(--ds-color-surface-bench)',
                'surface-trough': 'var(--ds-color-surface-trough)',
                'surface-plate': 'var(--ds-color-surface-plate)',
                'surface-slot': 'var(--ds-color-surface-slot)',
                'surface-station-header': 'var(--ds-station-header)',
                'surface-station-well': 'var(--ds-station-well)',
                'surface-station-plate': 'var(--ds-station-plate)',
                'surface-station-slot': 'var(--ds-station-slot)',
                'surface-station-bar': 'var(--ds-station-bar)',
                'surface-station-row-hover': 'var(--ds-station-row-hover)',
                'surface-station-header-hover': 'var(--ds-station-header-hover)',
                // Inverted chrome — dark pills/action bars/headers that must
                // stay distinct-but-themed (mid-slate on dark, near-black on
                // light). Text on them = text-inverse / text-inverse-soft.
                'surface-inverse': 'var(--ds-color-surface-inverse)',
                'surface-inverse-hover': 'var(--ds-color-surface-inverse-hover)',
                // Chip resting ON an inverse bar (≈ gray-700 fill).
                'surface-inverse-raised': 'var(--ds-color-surface-inverse-raised)',
                // Muted standalone dark fill (≈ gray-600 fill).
                'surface-inverse-soft': 'var(--ds-color-surface-inverse-soft)',
                'text-inverse': 'var(--ds-color-text-inverse)',
                'text-inverse-soft': 'var(--ds-color-text-inverse-soft)',
                // ── Fixed, scheme-INDEPENDENT stage/overlay vocabulary ──
                // These are deliberately identical in every theme (plain hex, so
                // Tailwind's native alpha modifiers work: bg-scrim/40, bg-glass/10).
                // scrim  — modal/photo backdrop washes (was bg-black/NN, bg-gray-900/NN)
                // glass  — light glass highlight on colored/dark fills (was bg-white/5..40)
                // stage  — immersive media chrome: camera viewfinders, photo
                //          lightboxes, fullscreen scanners. Always dark, in every
                //          theme — the stage serves the media, not the palette.
                scrim: '#020617',
                glass: '#ffffff',
                stage: {
                    DEFAULT: '#000000', // viewfinder / lightbox backdrop
                    raised: '#1f2937', // control pills on the stage (≈ gray-800)
                    soft: '#d1d5db', // secondary text/icons on the stage (≈ gray-300)
                    contrast: '#ffffff', // shutter buttons / max-contrast elements
                },
                'border-soft': 'var(--ds-color-border-subtle)',
                'border-default': 'var(--ds-color-border-default)',
                // Near-invisible hairlines (≈ border-gray-100).
                'border-hairline': 'var(--ds-color-border-hairline)',
                // Emphasis border (≈ gray-400: dashed drop-zones, dotted underlines).
                'border-emphasis': 'var(--ds-color-border-emphasis)',
                'border-stain': 'var(--ds-color-border-stain)',
                'border-ply': 'var(--ds-color-border-ply)',
                'border-station-shadow': 'var(--ds-station-bevel-shadow)',
                'border-station-highlight': 'var(--ds-station-bevel-highlight)',
                // Max-emphasis border (≈ gray-900 selection outlines).
                'border-strong': 'var(--ds-color-border-strong)',
                // Border on inverted chrome (≈ gray-700 on a gray-900 bar).
                'border-inverse': 'var(--ds-color-border-inverse)',
                // Functional tones — status pills/badges:
                // bg-surface-success + text-text-success + border-border-success.
                'text-success': 'var(--ds-color-text-success)',
                'text-warning': 'var(--ds-color-text-warning)',
                'text-danger': 'var(--ds-color-text-danger)',
                'text-accent': 'var(--ds-color-text-accent)',
                'surface-success': 'var(--ds-color-surface-success)',
                'surface-warning': 'var(--ds-color-surface-warning)',
                'surface-danger': 'var(--ds-color-surface-danger)',
                'surface-accent': 'var(--ds-color-surface-accent)',
                'border-success': 'var(--ds-color-border-success)',
                'border-warning': 'var(--ds-color-border-warning)',
                'border-danger': 'var(--ds-color-border-danger)',
                'border-accent': 'var(--ds-color-border-accent)',
                // Extended tone text (dashboard categories / informational accents).
                'text-info': 'var(--ds-color-text-info)',
                'text-fulfillment': 'var(--ds-color-text-fulfillment)',
                // Solid tone fills — progress bars, accent lines, saturated
                // indicators (bg-fill-info, …). Themed per palette.
                'fill-info': 'var(--ds-color-fill-info)',
                'fill-success': 'var(--ds-color-fill-success)',
                'fill-warning': 'var(--ds-color-fill-warning)',
                'fill-danger': 'var(--ds-color-fill-danger)',
                'fill-fulfillment': 'var(--ds-color-fill-fulfillment)',
                // Task-mode surfaces (src/design-system/modes/registry.ts).
                // Resolve inside a `data-mode` region only; the neutral
                // `surface-*` / `text-*` / `border-*` aliases above already
                // adopt the mode there, so reach for these only for roles the
                // theme has no twin for (bar, control border, warn ink, brand).
                'mode-canvas': 'var(--mode-canvas)',
                'mode-bar': 'var(--mode-bar)',
                'mode-panel': 'var(--mode-panel)',
                'mode-well': 'var(--mode-well)',
                'mode-hover': 'var(--mode-hover)',
                'mode-ink': 'var(--mode-ink)',
                'mode-muted': 'var(--mode-muted)',
                'mode-faint': 'var(--mode-faint)',
                'mode-rule': 'var(--mode-rule)',
                'mode-edge': 'var(--mode-edge)',
                'mode-control': 'var(--mode-control)',
                'mode-divide': 'var(--mode-divide)',
                'mode-seam': 'var(--mode-seam)',
                'mode-frame': 'var(--mode-frame)',
                'mode-fact': 'var(--mode-fact)',
                'mode-mark': 'var(--mode-mark)',
                'mode-warn': 'var(--mode-warn-text)',
                'mode-brand': 'var(--mode-brand)',
                // AI design system (src/design-system/ai/tokens.ts). Neutrals
                // alias the theme (so they follow light/dark and every
                // palette); the iridescent accent is a GRADIENT, bound under
                // backgroundImage below — there is no flat accent colour.
                'ai-canvas': 'var(--ai-canvas)',
                'ai-surface': 'var(--ai-surface)',
                'ai-sunken': 'var(--ai-sunken)',
                'ai-hover': 'var(--ai-hover)',
                'ai-ink': 'var(--ai-ink)',
                'ai-muted': 'var(--ai-muted)',
                'ai-faint': 'var(--ai-faint)',
                'ai-line': 'var(--ai-line)',
                'ai-line-strong': 'var(--ai-line-strong)',
                'ai-solid': 'var(--ai-solid)',
                'ai-solid-ink': 'var(--ai-solid-ink)',
                'ai-user': 'var(--ai-user)',
                'ai-user-ink': 'var(--ai-user-ink)',
                'ai-scrim': 'var(--ai-scrim)',
            },
            fontFamily: {
                sans: ['var(--ds-font-sans)', 'Inter', 'system-ui', 'sans-serif'],
                // Dense-chrome cut. You should almost never write `font-condensed`
                // by hand — `text-role-eyebrow` / `text-role-micro` bind it
                // intrinsically (plugin below). Reach for the ROLE whose job is
                // dense chrome, not for the family.
                condensed: ['var(--ds-font-condensed)', 'IBM Plex Sans Condensed', 'Inter', 'system-ui', 'sans-serif'],
                // Master-nav spine only (`font-spine` on MasterNavView). Not a
                // fourth app cut — it resolves to the app sans (no Overpass load).
                spine: ['var(--ds-font-sans)', 'Inter', 'system-ui', 'sans-serif'],
                mono: ['var(--ds-font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
            },
            fontSize: {
                // Legacy px scale (mini/eyebrow/micro/caption/label) RETIRED
                // 2026-07-13 (T4) — all ~4100 usages migrated onto CF Type roles
                // below via scripts/codemods/text-legacy-to-role.mjs.
                // ── CF Type — role-bundled scale (search-and-dense-ui-refactor
                //    plan §2.3). Each role bundles size + line-height + tracking
                //    + weight in ONE utility; consumers pick a ROLE, never a px.
                //    `rem`-based (respects user font-size / 200% zoom, WCAG) and
                //    density-aware: size = base × var(--cf-density) (default 1;
                //    `[data-density="compact"]` → 0.92). Weight + tracking do NOT
                //    scale with density (Carbon principle). Register every new
                //    name in CUSTOM_FONT_SIZES (src/utils/_cn.ts) or twMerge drops
                //    it. Numeric cells still add `tabular-nums` explicitly.
                'role-display': ['calc(1.5rem * var(--cf-density, 1))', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
                'role-title': ['calc(1.125rem * var(--cf-density, 1))', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
                'role-body': ['calc(0.875rem * var(--cf-density, 1))', { lineHeight: '1.45', letterSpacing: '0', fontWeight: '400' }],
                'role-data': ['calc(0.8125rem * var(--cf-density, 1))', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
                // Navigator label — the MasterNav spine + ⌘K palette rows.
                //
                // 13px, the same optical size as `role-data`, but a DIFFERENT
                // role because the two jobs disagree on numerals: `role-data`
                // binds `tabular-nums` (a qty column must not shimmy row to
                // row), and a nav label is prose that should kern normally.
                // Reusing `role-data` here would have been the cheap move and
                // would have quietly put tabular figures on every page name.
                //
                // ONE size for every altitude of the spine (2026-08-08): L1,
                // subgroup header and child row all render at this role, so
                // hierarchy is carried by indent, the nesting rail and INK —
                // never by a second size. Weight is set per state at the call
                // site (400 idle child · 500 parent/active) rather than baked,
                // because this role is the only one whose weight is a state.
                'role-nav': ['calc(0.8125rem * var(--cf-density, 1))', { lineHeight: '1.4', letterSpacing: '0' }],
                'role-caption': ['calc(0.75rem * var(--cf-density, 1))', { lineHeight: '1.35', letterSpacing: '0.01em', fontWeight: '500' }],
                // Eyebrow / micro tracking is the region's LABEL VOICE
                // (`--mode-label-tracking`, modes.ts); the fallback is the
                // unwrapped-route value. An explicit `tracking-*` still wins.
                'role-eyebrow': ['calc(0.6875rem * var(--cf-density, 1))', { lineHeight: '1.2', letterSpacing: 'var(--mode-label-tracking, 0.08em)', fontWeight: '600' }],
                'role-micro': ['calc(0.625rem * var(--cf-density, 1))', { lineHeight: '1.2', letterSpacing: 'var(--mode-label-tracking, 0.04em)', fontWeight: '600' }],
                // ── role-field: the TOUCH TEXT-ENTRY role ────────────────────
                //
                // 1rem = 16px, and it is the ONE role that deliberately does
                // NOT multiply by --cf-density.
                //
                // iOS Safari auto-zooms the viewport when a focused input's
                // computed font-size is under 16px. Every other role here is
                // 13px/14px and shrinks further at [data-density='compact']
                // (×0.92), so any input wearing one zooms the page on every
                // tap. The `user-scalable=no` / `maximum-scale=1` escape is
                // ignored by iOS Safari since iOS 10 AND would fail this repo's
                // own axe `meta-viewport` gate (WCAG 1.4.4, see layout.tsx) —
                // so the size IS the fix, and density must not be able to undo
                // it. A field that shrank back to 15px would silently bring the
                // zoom back.
                //
                // Register in CUSTOM_FONT_SIZES (src/utils/_cn.ts) or twMerge
                // drops it. Pinned by src/design-system/tokens/touch-field.test.ts.
                'role-field': ['1rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '450' }],
                // Task-mode body text (modes/registry.ts) — size follows the
                // region's mode and pointer; registered in CUSTOM_FONT_SIZES.
                'mode-body': ['var(--mode-text-body)', { lineHeight: '1.45' }],
                // AI chat prose scale (src/design-system/ai/tokens.ts AI_TYPE) —
                // NOT density-scaled: prose is read, not scanned. Registered in
                // CUSTOM_FONT_SIZES (src/utils/_cn.ts).
                'ai-greeting': ['var(--ai-text-greeting)', { lineHeight: 'var(--ai-leading-greeting)', letterSpacing: 'var(--ai-tracking-greeting)', fontWeight: 'var(--ai-weight-greeting)' }],
                'ai-prose': ['var(--ai-text-prose)', { lineHeight: 'var(--ai-leading-prose)', letterSpacing: 'var(--ai-tracking-prose)', fontWeight: 'var(--ai-weight-prose)' }],
                'ai-title': ['var(--ai-text-title)', { lineHeight: 'var(--ai-leading-title)', letterSpacing: 'var(--ai-tracking-title)', fontWeight: 'var(--ai-weight-title)' }],
                'ai-prose-sm': ['var(--ai-text-prose-sm)', { lineHeight: 'var(--ai-leading-prose-sm)', letterSpacing: 'var(--ai-tracking-prose-sm)', fontWeight: 'var(--ai-weight-prose-sm)' }],
                'ai-label': ['var(--ai-text-label)', { lineHeight: 'var(--ai-leading-label)', letterSpacing: 'var(--ai-tracking-label)', fontWeight: 'var(--ai-weight-label)' }],
            },
            // Density-aware spacing (spacing-token-leakage plan Phase 1) —
            // the same calc(× --cf-density) treatment as the role-* type
            // scale above. At the default density (1) every value is
            // pixel-identical to Tailwind's stock scale, so this is purely
            // additive; inside [data-density='compact'] padding/margin/gap
            // tighten together with type. `extend` merges per key: keys in
            // spacing.mjs become density-aware, unlisted keys stay stock.
            spacing: {
                ...spacingScale,
                'mode-page': 'var(--mode-page-pad)',
                // AI system measure (src/design-system/ai/tokens.ts AI_SPACE).
                'ai-gutter': 'var(--ai-gutter)',
                'ai-turn': 'var(--ai-turn)',
            },
            maxWidth: { 'ai-column': 'var(--ai-column)' },
            width: { 'ai-panel': 'var(--ai-panel)' },
            // The AI iridescent accent (src/design-system/ai/tokens.ts
            // AI_IRIS_GRADIENTS) — AI activity only, never static chrome.
            backgroundImage: {
                'ai-iris': 'var(--ai-iris-linear)',
                'ai-iris-sweep': 'var(--ai-iris-sweep)',
                'ai-iris-conic': 'var(--ai-iris-conic)',
            },
            // borderRadius stays 100% Tailwind stock for every NAMED step — the
            // one alias that lived here (`station: 8px`) duplicated `rounded-lg`.
            // Semantic corners come from `cornerClass(role)`
            // (src/design-system/tokens/radius.ts), which returns stock classes.
            // The only extension is the task-mode pair, which is not a step but
            // a var the region's mode resolves (`rounded-mode`, `-mode-pill`);
            // both are registered in the `rounded` group in src/utils/_cn.ts so
            // they conflict-resolve against stock `rounded-*`.
            borderRadius: {
                mode: 'var(--mode-radius)',
                'mode-control': 'var(--mode-radius-control)',
                'mode-pill': 'var(--mode-radius-pill)',
                // AI system corners (src/design-system/ai/tokens.ts AI_RADIUS).
                'ai-control': 'var(--ai-radius-control)',
                'ai-chip': 'var(--ai-radius-chip)',
                'ai-step': 'var(--ai-radius-step)',
                'ai-card': 'var(--ai-radius-card)',
                'ai-panel': 'var(--ai-radius-panel)',
                'ai-bubble': 'var(--ai-radius-bubble)',
                'ai-composer': 'var(--ai-radius-composer)',
            },
            minHeight: {
                'mode-hit': 'var(--mode-hit)',
                'mode-hit-cta': 'var(--mode-hit-cta)',
            },
            transitionDuration: {
                'mode-feedback': 'var(--mode-motion-feedback)',
                'mode-press': 'var(--mode-motion-press)',
                'mode-pulse': 'var(--mode-motion-pulse)',
            },
            // Elevation ladder — the role → box-shadow SoT consumed via
            // elevationClass() (src/design-system/tokens/shadows.ts). Values
            // are CSS vars (globals.css) so dark-family themes ramp the alpha
            // without a second class name. Each role is an ambient + key + cast
            // stack: the zero-offset ambient layer is what keeps depth readable
            // at the TOP edge of a surface that runs past the fold.
            // Register new names in the `shadow` group in src/utils/_cn.ts or
            // twMerge misgroups them as shadow-COLOR and conflict resolution
            // silently stops working.
            boxShadow: {
                'elev-soft': 'var(--ds-elev-soft)',
                'elev-raised': 'var(--ds-elev-raised)',
                'elev-overlay': 'var(--ds-elev-overlay)',
                'elev-overlay-left': 'var(--ds-elev-overlay-left)',
                'elev-overlay-right': 'var(--ds-elev-overlay-right)',
                // AI system depth (src/design-system/ai/tokens.ts AI_ELEVATION).
                'ai-card': 'var(--ai-shadow-card)',
                'ai-card-hover': 'var(--ai-shadow-card-hover)',
                'ai-composer': 'var(--ai-shadow-composer)',
                'ai-panel': 'var(--ai-shadow-panel)',
            },
            zIndex: zIndexScale,
        },
    },
    plugins: [
        // Spacing INTENTS (spacing-token-leakage plan Phase 2) — one named
        // utility per recurring padding/stack job. The VALUE belongs to the
        // region's task mode (`spacing` in packages/design-tokens/src/modes.ts
        // → `--mode-inset-*` / `--mode-stack-*` / `--mode-row-*`, `:root` =
        // triage), times `--cf-density` so compact density and table zoom
        // still tighten it. An intent is the WHOLE padding story for its
        // element: never stack a raw p-*/px-* on top (cn() keeps both and the
        // intent wins in CSS order — see the 'cf-*' groups in
        // src/utils/_cn.ts). Registered in the safelist above; conflict groups
        // in _cn.ts; both lists must stay in sync with this plugin.
        plugin(({ addUtilities }) => {
            const d = (v) => `calc(var(--mode-${v}) * var(--cf-density, 1))`;
            const inset = (intent) => ({ paddingInline: d(`inset-${intent}-x`), paddingBlock: d(`inset-${intent}-y`) });
            addUtilities({
                ".inset-chip": inset("chip"),
                ".inset-field": inset("field"),
                ".inset-cozy": inset("cozy"),
                ".inset-card": inset("card"),
                ".inset-empty": inset("empty"),
                ".stack-tight": { display: "flex", flexDirection: "column", gap: d("stack-tight") },
                ".stack-row": { display: "flex", flexDirection: "column", gap: d("stack-row") },
                ".stack-section": { display: "flex", flexDirection: "column", gap: d("stack-section") },
                ".row-gap": { display: "flex", alignItems: "center", gap: d("row-gap") },
                ".row-tight": { display: "flex", alignItems: "center", gap: d("row-tight") },
            });
        }),
        // CF Type — INTRINSIC role bindings (contextual-font-system, 2026-07-28).
        //
        // A role bundles size + line-height + tracking + weight in `fontSize`
        // above; Tailwind's fontSize options cannot carry a family or a numeric
        // variant, so the remaining two bindings are added here against the SAME
        // class names. Different properties, so the two rules compose regardless
        // of emission order.
        //
        // WHY these two bindings are intrinsic rather than opt-in classes:
        //   · Contextuality in this product is width, not face-swapping. The
        //     eyebrow/micro roles ARE the dense-chrome job, so the condensed cut
        //     belongs to the role — an opt-in `font-condensed` beside the role
        //     would drift the moment someone forgets it.
        //   · Numerals in data/title/display sit in columns that must align. If
        //     tabular-ness is opt-in it is missing exactly where a scan-reading
        //     operator notices (a qty column that shimmies row to row).
        // A surface that genuinely wants proportional figures opts out with
        // Tailwind's own `proportional-nums`, which wins on specificity order.
        plugin(({ addUtilities }) => {
            addUtilities({
                // Case is the region's LABEL VOICE (`--mode-label-case`): a
                // label never hard-codes caps — the mode decides. Codes that are
                // caps by identity (SKU, lifecycle code) add `uppercase`.
                ".text-role-eyebrow": { fontFamily: "var(--ds-font-condensed)", textTransform: "var(--mode-label-case, none)" },
                ".text-role-micro": { fontFamily: "var(--ds-font-condensed)", textTransform: "var(--mode-label-case, none)" },
                // Spine-local: intrinsic eyebrow/micro family would otherwise
                // keep Plex Condensed on search-result context inside the map.
                ".font-spine .text-role-eyebrow": { fontFamily: "var(--ds-font-sans)" },
                ".font-spine .text-role-micro": { fontFamily: "var(--ds-font-sans)" },
                ".text-role-display": { fontVariantNumeric: "tabular-nums" },
                ".text-role-title": { fontVariantNumeric: "tabular-nums" },
                ".text-role-data": { fontVariantNumeric: "tabular-nums" },
                // The fact-label VOICE follows the region's mode (modes.ts
                // `labelVoice`): mono heavy on the floor, sans on a desk; the
                // case comes from `--mode-label-case`. Fallbacks are the floor voice.
                ".mode-label": {
                    fontFamily: "var(--mode-label-font, var(--ds-font-mono))",
                    fontSize: "calc(var(--mode-label-size, 0.625rem) * var(--cf-density, 1))",
                    fontWeight: "var(--mode-label-weight, 700)",
                    textTransform: "var(--mode-label-case, none)",
                    letterSpacing: "var(--mode-label-tracking, 0.08em)",
                    lineHeight: "1.2",
                },
                ".mode-label-case": {
                    textTransform: "var(--mode-label-case, none)",
                    letterSpacing: "var(--mode-label-tracking, 0.04em)",
                },
            });
        }),
    ],
};
export default config;

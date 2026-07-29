import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
// NOTE: import `.mjs` values modules, not `.ts`. Tailwind's config loader
// runs under Node; a `.ts` import with ESM syntax triggers
// MODULE_TYPELESS_PACKAGE_JSON reparsing (performance overhead + build noise).
// Turbopack dev also resolves `.mjs` from this config. Values + types SoT
// pairs: `src/design-system/tokens/z-index.mjs` + `z-index.ts`,
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
 * Theme-registry color: a Tailwind v3 "function color". With no alpha modifier
 * Tailwind passes `opacityValue = 'var(--tw-*-opacity)'` — we return the plain
 * `var()` (byte-identical CSS to a string color, zero regression). With a
 * modifier (`bg-surface-card/90`) it passes the number — we wrap in
 * `color-mix()` so alpha works over hex/rgba CSS variables (which `<alpha-value>`
 * substitution cannot do). Chrome 111+/Safari 16.2+ — fine for this app.
 *
 * NOTE: the gradient color-stop plugin (`from-*`/`via-*`/`to-*`, via
 * `transparentTo`) calls this with a NUMERIC `opacityValue` (e.g. `0` for the
 * implicit transparent stop), not a string — so we must String()-coerce before
 * `.startsWith`, else any themed gradient (e.g. `from-surface-accent`) throws
 * "opacityValue.startsWith is not a function" and breaks the whole CSS build.
 * Coercing also yields the right stop: `0` → `calc(0 * 100%)` = transparent.
 */
const themed = (cssVar: string) =>
    (({ opacityValue }: { opacityValue?: string | number }) =>
        opacityValue === undefined || String(opacityValue).startsWith('var(')
            ? `var(${cssVar})`
            : `color-mix(in srgb, var(${cssVar}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

const config: Config = {
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
                'accent-bg': themed('--ds-color-accent-bg'),
                'accent-hover': themed('--ds-color-accent-hover'),
                'accent-light': themed('--ds-color-accent-light'),
                'accent-border': themed('--ds-color-accent-border'),
                'accent-text': themed('--ds-color-accent-text'),
                'accent-shadow': themed('--ds-color-accent-shadow'),
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
                'text-default': themed('--ds-color-text-primary'),
                'text-muted': themed('--ds-color-text-secondary'),
                'text-soft': themed('--ds-color-text-soft'),
                'text-faint': themed('--ds-color-text-faint'),
                'surface-canvas': themed('--ds-color-background-canvas'),
                'surface-card': themed('--ds-color-background-surface'),
                'surface-sunken': themed('--ds-color-surface-sunken'),
                // Interaction wash (row hover) — lighter than card on dark,
                // canvas-toned on light. The codemod target for hover:bg-gray-50.
                'surface-hover': themed('--ds-color-surface-hover'),
                // Tracks / skeletons / avatar placeholders (≈ gray-200).
                'surface-strong': themed('--ds-color-surface-strong'),
                // Inverted chrome — dark pills/action bars/headers that must
                // stay distinct-but-themed (mid-slate on dark, near-black on
                // light). Text on them = text-inverse / text-inverse-soft.
                'surface-inverse': themed('--ds-color-surface-inverse'),
                'surface-inverse-hover': themed('--ds-color-surface-inverse-hover'),
                // Chip resting ON an inverse bar (≈ gray-700 fill).
                'surface-inverse-raised': themed('--ds-color-surface-inverse-raised'),
                // Muted standalone dark fill (≈ gray-600 fill).
                'surface-inverse-soft': themed('--ds-color-surface-inverse-soft'),
                'text-inverse': themed('--ds-color-text-inverse'),
                'text-inverse-soft': themed('--ds-color-text-inverse-soft'),
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
                'border-soft': themed('--ds-color-border-subtle'),
                'border-default': themed('--ds-color-border-default'),
                // Near-invisible hairlines (≈ border-gray-100).
                'border-hairline': themed('--ds-color-border-hairline'),
                // Emphasis border (≈ gray-400: dashed drop-zones, dotted underlines).
                'border-emphasis': themed('--ds-color-border-emphasis'),
                // Max-emphasis border (≈ gray-900 selection outlines).
                'border-strong': themed('--ds-color-border-strong'),
                // Border on inverted chrome (≈ gray-700 on a gray-900 bar).
                'border-inverse': themed('--ds-color-border-inverse'),
                // Functional tones — status pills/badges:
                // bg-surface-success + text-text-success + border-border-success.
                'text-success': themed('--ds-color-text-success'),
                'text-warning': themed('--ds-color-text-warning'),
                'text-danger': themed('--ds-color-text-danger'),
                'text-accent': themed('--ds-color-text-accent'),
                'surface-success': themed('--ds-color-surface-success'),
                'surface-warning': themed('--ds-color-surface-warning'),
                'surface-danger': themed('--ds-color-surface-danger'),
                'surface-accent': themed('--ds-color-surface-accent'),
                'border-success': themed('--ds-color-border-success'),
                'border-warning': themed('--ds-color-border-warning'),
                'border-danger': themed('--ds-color-border-danger'),
                'border-accent': themed('--ds-color-border-accent'),
                // Extended tone text (dashboard categories / informational accents).
                'text-info': themed('--ds-color-text-info'),
                'text-fulfillment': themed('--ds-color-text-fulfillment'),
                // Solid tone fills — progress bars, accent lines, saturated
                // indicators (bg-fill-info, …). Themed per palette.
                'fill-info': themed('--ds-color-fill-info'),
                'fill-success': themed('--ds-color-fill-success'),
                'fill-warning': themed('--ds-color-fill-warning'),
                'fill-danger': themed('--ds-color-fill-danger'),
                'fill-fulfillment': themed('--ds-color-fill-fulfillment'),
            },
            fontFamily: {
                sans: ['var(--ds-font-sans)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
                // Dense-chrome cut. You should almost never write `font-condensed`
                // by hand — `text-role-eyebrow` / `text-role-micro` bind it
                // intrinsically (plugin below). Reach for the ROLE whose job is
                // dense chrome, not for the family.
                condensed: ['var(--ds-font-condensed)', 'IBM Plex Sans Condensed', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
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
                'role-caption': ['calc(0.75rem * var(--cf-density, 1))', { lineHeight: '1.35', letterSpacing: '0.01em', fontWeight: '500' }],
                'role-eyebrow': ['calc(0.6875rem * var(--cf-density, 1))', { lineHeight: '1.2', letterSpacing: '0.08em', fontWeight: '600' }],
                'role-micro': ['calc(0.625rem * var(--cf-density, 1))', { lineHeight: '1.2', letterSpacing: '0.04em', fontWeight: '600' }],
            },
            // Density-aware spacing (spacing-token-leakage plan Phase 1) —
            // the same calc(× --cf-density) treatment as the role-* type
            // scale above. At the default density (1) every value is
            // pixel-identical to Tailwind's stock scale, so this is purely
            // additive; inside [data-density='compact'] padding/margin/gap
            // tighten together with type. `extend` merges per key: keys in
            // spacing.mjs become density-aware, unlisted keys stay stock.
            spacing: spacingScale,
            // borderRadius is deliberately NOT extended — the radius scale stays
            // 100% Tailwind stock. The one alias that lived here (`station: 8px`)
            // was an exact duplicate of `rounded-lg`, and being an unregistered
            // custom key it could not conflict-resolve in `cn()` (see _cn.ts),
            // so it and a primitive's own `rounded-*` both survived and CSS order
            // picked silently. Semantic corners come from `cornerClass(role)`
            // (src/design-system/tokens/radius.ts), which returns stock classes.
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
            },
            zIndex: zIndexScale,
        },
    },
    plugins: [
        // Spacing INTENTS (spacing-token-leakage plan Phase 2) — one named
        // utility per recurring padding/stack job, built from theme('spacing')
        // so each inherits density-awareness. An intent is the WHOLE padding
        // story for its element: never stack a raw p-*/px-* on top (cn() keeps
        // both and the intent wins in CSS order — see the 'cf-*' groups in
        // src/utils/_cn.ts). Registered in the safelist above; conflict groups
        // in _cn.ts; both lists must stay in sync with this plugin.
        plugin(({ addUtilities, theme }) => {
            const s = theme("spacing") as Record<string, string>;
            addUtilities({
                ".inset-chip": { paddingInline: s["1.5"], paddingBlock: s["0.5"] },
                ".inset-field": { paddingInline: s["3"], paddingBlock: s["2"] },
                ".inset-cozy": { paddingInline: s["2.5"], paddingBlock: s["1.5"] },
                ".inset-card": { padding: s["4"] },
                ".inset-empty": { paddingInline: s["4"], paddingBlock: s["6"] },
                ".stack-tight": { display: "flex", flexDirection: "column", gap: s["1.5"] },
                ".stack-row": { display: "flex", flexDirection: "column", gap: s["2"] },
                ".stack-section": { display: "flex", flexDirection: "column", gap: s["6"] },
                ".row-gap": { display: "flex", alignItems: "center", gap: s["2"] },
                ".row-tight": { display: "flex", alignItems: "center", gap: s["1.5"] },
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
                ".text-role-eyebrow": { fontFamily: "var(--ds-font-condensed)" },
                ".text-role-micro": { fontFamily: "var(--ds-font-condensed)" },
                ".text-role-display": { fontVariantNumeric: "tabular-nums" },
                ".text-role-title": { fontVariantNumeric: "tabular-nums" },
                ".text-role-data": { fontVariantNumeric: "tabular-nums" },
            });
        }),
    ],
};
export default config;

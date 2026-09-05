/**
 * Reskin GROUPS — the cherry-pick token layer for the QA Design Lab.
 *
 * A reskin is NOT a second theme and NOT a second product. It is a thin
 * OVERRIDE layer stamped on <html> as `data-reskin`, sitting on top of whatever
 * theme the staffer already has.
 *
 * ## Why groups and not one switch
 *
 * Operator, 2026-09-02: *"not a mass token change — I need to cherry pick and
 * nit pick."* A single before/after flip can only answer "do you like all 46 of
 * these at once", which is the one question nobody needs answered. So the
 * candidate is cut into small named groups and the attribute carries a LIST:
 *
 *   data-reskin="chrome status"      → chrome planes + status tones, nothing else
 *   data-reskin="after"              → every group (the alias; see below)
 *   (attribute absent)               → today's tokens, byte-identical to dogfood
 *
 * Each group emits its own block per scheme, selected with the space-separated
 * attribute operator:
 *
 *   html[data-reskin~='chrome']:not([data-color-scheme='dark'])  0,2,1
 *   html[data-reskin~='chrome'][data-color-scheme='dark']        0,2,1
 *
 * Both outrank every `html[data-theme='<name>']` block (0,1,1), and app/layout
 * emits this sheet AFTER the theme registry so equal-specificity accent blocks
 * lose to it on source order too.
 *
 * Groups are INDEPENDENT by construction: no key appears in two groups, so
 * enabling any subset is well-defined and order never matters. `groupKeyOwner`
 * is the tripwire for that.
 *
 * ## Scheme scoping is not optional
 *
 * The light block is scheme-SCOPED. A shared block looks tidier and is wrong:
 * it pushes light-scheme values onto every dark theme for any key the dark half
 * does not restate — a `text-secondary` of `#454d56` on a `#101317` canvas.
 * Each scheme carries its own complete values; nothing crosses the light/dark
 * line.
 *
 * ## `before` emits nothing
 *
 * "Before" is today's tokens — the live default — not a frozen copy. A snapshot
 * would drift the moment someone tuned a palette, and the two sides must differ
 * only by the group diff.
 *
 * ## What a reskin can and cannot move
 *
 * CAN: every `--ds-color-*` in THEME_VAR_KEYS, the `--ds-color-accent-*` set,
 * and the page-level `--background` / `--foreground`. All runtime variables.
 *
 * CANNOT: corner radius and type scale. Those are Tailwind CLASSES
 * (`rounded-*`, `text-role-*`) resolved at build time — `radius.ts` is
 * deliberately not wired into `tailwind.config.mjs`, so no runtime attribute
 * can move them. Graphite's 4/6/8 ladder and its Instrument Sans / Geist Mono
 * pairing are R1 primitive commits, not lab toggles. Do not "fix" this by
 * pointing `theme.extend.borderRadius` at `radius.ts`: that remaps every
 * `rounded-*` call site in the app at once.
 *
 * ## Promoting
 *
 * A group is the unit of sign-off. When one passes on every viewpoint that
 * matters, fold its values into the theme palettes (`src/design-system/themes/*.ts`)
 * and delete the group from here. When `RESKIN_GROUPS` is empty the lab has
 * nothing left to prove. See docs/warehouse-os/RESKIN-LAB.md.
 *
 * Values are transcribed from the R0 approval artifact,
 * `docs/warehouse-os/prototype/skin-graphite.html`. If a value here and a value
 * there disagree, the prototype is right and this is stale.
 */

import { THEME_VAR_KEYS, type AccentVars, type ThemeVarKey, type ThemeVars } from './registry';

export const RESKIN_ATTR = 'data-reskin' as const;

/** The whole-candidate alias. Expands to every group id; never emitted as CSS. */
export const RESKIN_ALL_ALIAS = 'after' as const;

/** The empty selection. Also the absence of the attribute. */
export const RESKIN_NONE = 'before' as const;

export type ReskinGroupId =
  | 'chrome'
  | 'text'
  | 'rules'
  | 'status'
  | 'accent'
  | 'bench'
  | 'inverse'
  | 'fills'
  | 'page'
  | 'paper';

type PageVars = Partial<{ background: string; foreground: string }>;

export interface ReskinGroup {
  id: ReskinGroupId;
  /** Face on the HUD toggle. */
  label: string;
  /** One line under it — what flipping this alone is meant to tell you. */
  note: string;
  lightVars?: Partial<ThemeVars>;
  darkVars?: Partial<ThemeVars>;
  lightAccent?: Partial<AccentVars>;
  darkAccent?: Partial<AccentVars>;
  lightPage?: PageVars;
  darkPage?: PageVars;
  /**
   * Ground texture — the MATERIAL layer.
   *
   * Emitted as a `body` rule under this group's selector, so the tooth paints
   * on the canvas plane and nothing else. Every opaque surface above it (card,
   * row, chip, the composer dock) masks it for free. That is the law "texture
   * lives on grounds and chrome, never behind data or the mouth" enforced by
   * CONSTRUCTION rather than by review — there is no way to spell "grain behind
   * a slot-table row" with this field.
   *
   * Amplitude is BAKED into the image, not exposed as a variable, because a CSS
   * custom property cannot be interpolated into a `url()` data URI. Light and
   * dark therefore carry their own image: the same alpha reads twice as strong
   * on a near-black ground as on kraft.
   *
   * `blend` is the compositing mode against the body's background COLOUR, which
   * is why this works at all — the noise multiplies into the stock rather than
   * sitting on top of it as a grey film.
   *
   * `stock` sets that colour. It lives here rather than in `lightVars` on
   * purpose: `--ds-color-background-canvas` is owned by `chrome`, and two groups
   * cannot claim one key (see `groupKeyOwner`). A `body` background-color is not
   * a token claim, so the material can carry its own ground without a collision
   * and without forking the palette groups.
   *
   * Kraft is a FIBRE, not a colour. The stock is a warm uncoated paper-grey, not
   * cardboard brown — operator correction, 2026-09-03: "kraft does not mean that
   * everything is brown, it means the underlying texture would be similar."
   * Brown belongs only where a brown object actually is, which is the bench
   * trough, and that lives in the `bench` group.
   */
  lightGround?: { image: string; blend: string; stock?: string };
  darkGround?: { image: string; blend: string; stock?: string };
}

/**
 * Candidate R1 — **Graphite**, picked by the operator 2026-09-02
 * (docs/warehouse-os/RESKIN.md §2). Dark is the design's home; the light twin
 * is a first-class theme and the STATION DEFAULT.
 */
export const RESKIN_CANDIDATE = {
  name: 'Graphite',
  hint: 'Cool layered chrome, teal accent, crisper rules, denser status tints.',
} as const;

export const RESKIN_GROUPS: readonly ReskinGroup[] = [
  {
    id: 'chrome',
    label: 'Chrome planes',
    note: 'Canvas drops away from card so a raised surface has real ground.',
    lightVars: {
      'background-canvas': '#eef0f2',
      'background-surface': '#ffffff',
      'surface-sunken': '#f4f6f7',
      'surface-hover': '#f8fafb',
      'surface-strong': '#e2e6e9',
    },
    darkVars: {
      'background-canvas': '#101317',
      'background-surface': '#1d2126',
      'surface-sunken': '#16191d',
      'surface-hover': '#23282e',
      'surface-strong': '#2b3137',
    },
  },
  {
    id: 'text',
    label: 'Text ramp',
    note: 'Four rungs, one step more contrast on secondary and soft.',
    lightVars: {
      'text-primary': '#171a1e',
      'text-secondary': '#454d56',
      'text-soft': '#6a737d',
      'text-faint': '#949ca4',
    },
    darkVars: {
      'text-primary': '#e8eaec',
      'text-secondary': '#b9c0c7',
      'text-soft': '#8d959d',
      'text-faint': '#6a727a',
    },
  },
  {
    id: 'rules',
    label: 'Rules',
    note: 'A hairline you can still see across a full-width grid.',
    lightVars: {
      'border-subtle': '#e4e7ea',
      'border-default': '#cbd1d6',
      'border-hairline': '#f0f2f4',
      'border-emphasis': '#949ca4',
      'border-strong': '#171a1e',
    },
    darkVars: {
      'border-subtle': '#262c32',
      'border-default': '#343b42',
      'border-hairline': '#1e2328',
      'border-emphasis': '#55606a',
      'border-strong': '#e8eaec',
    },
  },
  {
    id: 'status',
    label: 'Status tones',
    note: 'Denser tint, stronger edge. Keeps hue distance from the accent.',
    lightVars: {
      'text-success': '#1a7f52',
      'text-warning': '#97600f',
      'text-danger': '#b3271b',
      'surface-success': '#e4f5ec',
      'surface-warning': '#fbf0dc',
      'surface-danger': '#fce9e6',
      'border-success': '#a9dcc2',
      'border-warning': '#ecd3a0',
      'border-danger': '#f3c2ba',
    },
    darkVars: {
      'text-success': '#52d39b',
      'text-warning': '#e6b35a',
      'text-danger': '#f2857a',
      'surface-success': '#14312a',
      'surface-warning': '#342910',
      'surface-danger': '#3a1d1b',
      'border-success': '#1f4a3d',
      'border-warning': '#55401a',
      'border-danger': '#5b2c28',
    },
  },
  {
    id: 'accent',
    label: 'Accent (teal)',
    note: 'Overrides the per-staff accent — teal IS the skin, so a lab sitting that kept each staffer’s blue would compare something Graphite does not propose.',
    lightVars: {
      'text-accent': '#0c7d73',
      'surface-accent': '#dff2ef',
      'border-accent': '#9dd5cd',
    },
    darkVars: {
      'text-accent': '#4fd6c9',
      'surface-accent': '#12332f',
      'border-accent': '#1d5a53',
    },
    lightAccent: {
      bg: '#0f9c90',
      hover: '#0b877d',
      light: 'rgba(15, 156, 144, 0.12)',
      border: 'rgba(15, 156, 144, 0.38)',
      text: '#0c7d73',
      shadow: 'rgba(15, 156, 144, 0.10)',
    },
    darkAccent: {
      bg: '#19b3a6',
      hover: '#2ecfc1',
      light: 'rgba(25, 179, 166, 0.16)',
      border: 'rgba(25, 179, 166, 0.42)',
      text: '#4fd6c9',
      shadow: 'rgba(25, 179, 166, 0.08)',
    },
  },
  {
    id: 'bench',
    label: 'Bench wells',
    note: 'Station wells stay WARM under a cool shell — a cold well reads as a disabled field.',
    lightVars: {
      'surface-bench': '#efe7da',
      'surface-trough': '#d9cdb9',
      'surface-plate': '#f6f0e6',
      'surface-slot': '#b39a7c',
      'border-stain': '#6b533a',
      'border-ply': '#e6dcc9',
    },
    darkVars: {
      'surface-bench': '#2a2723',
      'surface-trough': '#1c1a17',
      'surface-plate': '#33302b',
      'surface-slot': '#453f36',
      'border-stain': '#0d0c0a',
      'border-ply': '#4a453d',
    },
  },
  {
    id: 'inverse',
    label: 'Inverse chrome',
    note: 'Dark pills and action bars. On a dark shell the ladder inverts to light.',
    lightVars: {
      'surface-inverse': '#171a1e',
      'surface-inverse-hover': '#262b31',
      'surface-inverse-raised': '#363d44',
      'surface-inverse-soft': '#4c545c',
      'text-inverse': '#f7f8f9',
      'text-inverse-soft': '#c8cdd2',
      'border-inverse': '#3a4148',
    },
    darkVars: {
      'surface-inverse': '#e8eaec',
      'surface-inverse-hover': '#d4d8dc',
      'surface-inverse-raised': '#c0c6cc',
      'surface-inverse-soft': '#a8b0b7',
      'text-inverse': '#14171a',
      'text-inverse-soft': '#3d444b',
      'border-inverse': '#c0c6cc',
    },
  },
  {
    id: 'fills',
    label: 'Solid fills',
    note: 'Progress bars and saturated indicators, plus the extended tone text.',
    lightVars: {
      'text-info': '#2b5d94',
      'text-fulfillment': '#6f42a8',
      'fill-info': '#2f7fd4',
      'fill-success': '#1f9c63',
      'fill-warning': '#d08a1c',
      'fill-danger': '#d0453a',
      'fill-fulfillment': '#8355c4',
    },
    darkVars: {
      'text-info': '#8fb8e8',
      'text-fulfillment': '#c39ae8',
      'fill-info': '#4a90e2',
      'fill-success': '#3cc98a',
      'fill-warning': '#e0a03c',
      'fill-danger': '#e8695c',
      'fill-fulfillment': '#a97ce0',
    },
  },
  {
    id: 'paper',
    label: 'Paper tooth',
    note: 'The material layer — warm uncoated stock plus fine isotropic fibre, on the ground plane only. Kraft is the FIBRE, not a brown wash: surfaces above stay light and the tooth does the material work.',
    // Deliberately owns NO theme keys. Texture is orthogonal to palette: flip it
    // with `bench` for kraft-with-tooth, or alone to feel tooth over today's
    // colours. Owning a colour key here would also collide with `chrome` /
    // `bench` and trip the disjointness tripwire.
    lightGround: {
      // Warm uncoated paper-grey. Light enough that white cards still read as
      // raised sheets on top of it, warm enough to say "stock" and not "steel".
      stock: '#eceae3',
      image:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23t)' opacity='0.12'/%3E%3C/svg%3E\")",
      blend: 'multiply',
    },
    darkGround: {
      stock: '#15161a',
      image:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23t)' opacity='0.05'/%3E%3C/svg%3E\")",
      blend: 'screen',
    },
  },
  {
    id: 'page',
    label: 'Page ground',
    note: 'The body pair behind every route. Flip with chrome or the two disagree.',
    lightPage: { background: '#ffffff', foreground: '#171a1e' },
    darkPage: { background: '#101317', foreground: '#e8eaec' },
  },
];

export const RESKIN_GROUP_IDS: readonly ReskinGroupId[] = RESKIN_GROUPS.map((g) => g.id);

export function isReskinGroupId(value: unknown): value is ReskinGroupId {
  return typeof value === 'string' && (RESKIN_GROUP_IDS as readonly string[]).includes(value);
}

/**
 * Which group owns a given theme key. `null` when nobody does.
 *
 * Groups must be DISJOINT — a key in two groups would make the rendered value
 * depend on emission order, so "chrome only" and "chrome + rules" could paint
 * the same key differently for reasons the operator cannot see. The tripwire in
 * catalog.test.ts asserts this.
 */
export function groupKeyOwner(key: ThemeVarKey): ReskinGroupId | null {
  for (const group of RESKIN_GROUPS) {
    if (group.lightVars?.[key] !== undefined || group.darkVars?.[key] !== undefined) return group.id;
  }
  return null;
}

/**
 * Parse a selection from a URL param, storage, or the attribute itself.
 *
 * Accepts a space- or comma-separated list, the `after` alias (every group),
 * and `before` / null / nonsense (empty). Unknown ids are dropped rather than
 * failing: a stale deep link should degrade to fewer groups, never to a crash.
 * Output is de-duplicated and in RESKIN_GROUP_IDS order, so the attribute is
 * canonical and two equivalent selections stamp identical markup.
 */
export function parseReskinSelection(raw: string | null | undefined): ReskinGroupId[] {
  if (!raw) return [];
  const tokens = raw.split(/[\s,+]+/).filter(Boolean);
  if (tokens.some((t) => t === RESKIN_ALL_ALIAS)) return [...RESKIN_GROUP_IDS];
  const picked = new Set(tokens.filter(isReskinGroupId));
  return RESKIN_GROUP_IDS.filter((id) => picked.has(id));
}

/** The attribute / storage / query value for a selection. Empty ⇒ `''`. */
export function serializeReskinSelection(ids: readonly ReskinGroupId[]): string {
  return RESKIN_GROUP_IDS.filter((id) => ids.includes(id)).join(' ');
}

export function isEveryGroup(ids: readonly ReskinGroupId[]): boolean {
  return RESKIN_GROUP_IDS.every((id) => ids.includes(id));
}

/** Theme keys the given selection moves (defaults to every group). */
export function reskinChangedKeys(ids: readonly ReskinGroupId[] = RESKIN_GROUP_IDS): ThemeVarKey[] {
  const active = RESKIN_GROUPS.filter((g) => ids.includes(g.id));
  return THEME_VAR_KEYS.filter((key) =>
    active.some((g) => g.lightVars?.[key] !== undefined || g.darkVars?.[key] !== undefined),
  );
}

/** Declaration count a group contributes, for the HUD's per-group readout. */
export function reskinGroupSize(group: ReskinGroup): number {
  const keys = new Set<string>([
    ...Object.keys(group.lightVars ?? {}),
    ...Object.keys(group.darkVars ?? {}),
    ...Object.keys(group.lightAccent ?? {}).map((k) => `accent-${k}`),
    ...Object.keys(group.darkAccent ?? {}).map((k) => `accent-${k}`),
    ...Object.keys(group.lightPage ?? {}).map((k) => `page-${k}`),
    ...Object.keys(group.darkPage ?? {}).map((k) => `page-${k}`),
    ...(group.lightGround || group.darkGround ? ['ground'] : []),
  ]);
  return keys.size;
}

const ACCENT_KEYS = ['bg', 'hover', 'light', 'border', 'text', 'shadow'] as const;

function varLines(vars: Partial<ThemeVars> | undefined): string[] {
  if (!vars) return [];
  return THEME_VAR_KEYS.filter((key) => vars[key] !== undefined).map(
    (key) => `  --ds-color-${key}: ${vars[key]};`,
  );
}

function accentLines(accent: Partial<AccentVars> | undefined): string[] {
  if (!accent) return [];
  return ACCENT_KEYS.filter((k) => accent[k] !== undefined).map(
    (k) => `  --ds-color-accent-${k}: ${accent[k]};`,
  );
}

function pageLines(page: PageVars | undefined): string[] {
  if (!page) return [];
  const lines: string[] = [];
  if (page.background !== undefined) lines.push(`  --background: ${page.background};`);
  if (page.foreground !== undefined) lines.push(`  --foreground: ${page.foreground};`);
  return lines;
}

/**
 * The whole override stylesheet — two blocks per group, one per scheme.
 * Emitted into <head> by app/layout.tsx ONLY for a Design-Lab-entitled session;
 * dogfood never ships these bytes.
 */
export function reskinRegistryCssText(): string {
  const blocks: string[] = [];

  for (const group of RESKIN_GROUPS) {
    const light = [
      ...varLines(group.lightVars),
      ...accentLines(group.lightAccent),
      ...pageLines(group.lightPage),
    ];
    if (light.length > 0) {
      blocks.push(
        `html[${RESKIN_ATTR}~='${group.id}']:not([data-color-scheme='dark']) {\n${light.join('\n')}\n}`,
      );
    }

    const dark = [
      ...varLines(group.darkVars),
      ...accentLines(group.darkAccent),
      ...pageLines(group.darkPage),
    ];
    if (dark.length > 0) {
      blocks.push(
        `html[${RESKIN_ATTR}~='${group.id}'][data-color-scheme='dark'] {\n${dark.join('\n')}\n}`,
      );
    }

    // The ground rule targets `body`, never `:root`. globals.css sets
    // `background: var(--background)` (a shorthand, so it resets
    // background-image); this rule is later in source order and more specific,
    // so it adds the image while the stock colour underneath survives.
    if (group.lightGround) {
      const g = group.lightGround;
      blocks.push(
        `html[${RESKIN_ATTR}~='${group.id}']:not([data-color-scheme='dark']) body {\n` +
          (g.stock ? `  background-color: ${g.stock};\n` : '') +
          `  background-image: ${g.image};\n` +
          `  background-blend-mode: ${g.blend};\n}`,
      );
    }
    if (group.darkGround) {
      const g = group.darkGround;
      blocks.push(
        `html[${RESKIN_ATTR}~='${group.id}'][data-color-scheme='dark'] body {\n` +
          (g.stock ? `  background-color: ${g.stock};\n` : '') +
          `  background-image: ${g.image};\n` +
          `  background-blend-mode: ${g.blend};\n}`,
      );
    }
  }

  return blocks.join('\n\n');
}

export const reskinStyleText = reskinRegistryCssText();

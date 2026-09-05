import { PageHeader } from '@/components/ui/pane-header';
import { Button } from '@/design-system/primitives/Button';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { Button as ChromeButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { RESKIN_GROUPS } from '@/design-system/themes/reskin';

export const metadata = { title: 'Design Lab — Sandbox' };

/**
 * The SANDBOX — every primitive in every state, on one page, organised by the
 * token group that moves it.
 *
 * ## Why this exists next to the route catalog
 *
 * The catalog (../page.tsx) opens REAL routes and answers "does the warehouse
 * still work under this skin". It cannot answer "what exactly did that group
 * change", because a route shows you three buttons in one state. Tuning tokens
 * needs the opposite: every variant, every state, one screen, no navigation.
 *
 * Operator, 2026-09-03: *"it must just be a sandbox page in general, so I would
 * be able to see all the different scenarios and see all the differences within
 * the components."*
 *
 * ## Why this is NOT the `design-demo` zoo that was deleted
 *
 * That page hand-wrote examples, so it drifted from the components it claimed
 * to document and became a liability. Every specimen here is either
 *
 *   1. the REAL component imported from its home (Button, Badge, Input,
 *      Checkbox, Alert, Skeleton, Separator), rendered across its own declared
 *      variant axis — `BUTTON_VARIANTS` is iterated, not transcribed, so a new
 *      variant appears here the day it ships; or
 *   2. a TOKEN specimen painted directly with `var(--ds-color-*)`, which is the
 *      variable itself and therefore cannot disagree with the theme.
 *
 * Nothing here re-implements a component. If it looks wrong on this page it is
 * wrong in the product.
 *
 * ## How to use it
 *
 * Flip groups in the skin control (bottom-left). Each section names the group
 * that owns it, so you know where to look. Sections whose group is off are
 * showing today's tokens.
 */

const GROUP_BY_ID = Object.fromEntries(RESKIN_GROUPS.map((g) => [g.id, g]));

function Section({
  group,
  title,
  children,
}: {
  group?: string;
  title: string;
  children: React.ReactNode;
}) {
  const g = group ? GROUP_BY_ID[group] : undefined;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-soft pb-1.5">
        <h2 className="text-role-body font-semibold text-text-default">{title}</h2>
        {g && (
          <>
            <code className="text-role-micro text-text-accent">{g.id}</code>
            <span className="text-role-caption text-text-soft">{g.note}</span>
          </>
        )}
      </div>
      {children}
    </section>
  );
}

/** A labelled specimen cell. Label is always visible — no hover to discover. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="truncate text-role-micro text-text-faint">{label}</span>
      {children}
    </div>
  );
}

/** A raw token swatch. Painted with the variable, so it IS the token. */
function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-11 w-full border border-border-soft"
        style={{ background: `var(${token})` }}
      />
      <span className="truncate text-role-micro text-text-faint" title={token}>
        {label}
      </span>
    </div>
  );
}

const SURFACES = [
  ['--ds-color-background-canvas', 'canvas'],
  ['--ds-color-background-surface', 'surface'],
  ['--ds-color-surface-sunken', 'sunken'],
  ['--ds-color-surface-hover', 'hover'],
  ['--ds-color-surface-strong', 'strong'],
] as const;

const TEXT_RUNGS = [
  ['--ds-color-text-primary', 'primary'],
  ['--ds-color-text-secondary', 'secondary'],
  ['--ds-color-text-soft', 'soft'],
  ['--ds-color-text-faint', 'faint'],
] as const;

const RULES = [
  ['--ds-color-border-hairline', 'hairline'],
  ['--ds-color-border-subtle', 'subtle'],
  ['--ds-color-border-default', 'default'],
  ['--ds-color-border-emphasis', 'emphasis'],
  ['--ds-color-border-strong', 'strong'],
] as const;

const TONES = ['success', 'warning', 'danger', 'accent'] as const;

const BENCH = [
  ['--ds-color-surface-bench', 'bench'],
  ['--ds-color-surface-trough', 'trough'],
  ['--ds-color-surface-plate', 'plate'],
  ['--ds-color-surface-slot', 'slot'],
] as const;

const INVERSE = [
  ['--ds-color-surface-inverse', 'inverse'],
  ['--ds-color-surface-inverse-hover', 'hover'],
  ['--ds-color-surface-inverse-raised', 'raised'],
  ['--ds-color-surface-inverse-soft', 'soft'],
] as const;

const FILLS = [
  ['--ds-color-fill-info', 'info'],
  ['--ds-color-fill-success', 'success'],
  ['--ds-color-fill-warning', 'warning'],
  ['--ds-color-fill-danger', 'danger'],
  ['--ds-color-fill-fulfillment', 'fulfillment'],
] as const;

const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'destructive', 'success', 'warning'] as const;
const ALERT_VARIANTS = ['default', 'warning', 'success', 'destructive'] as const;
const CHROME_VARIANTS = ['ghost', 'outline', 'default', 'destructive'] as const;

export default function DesignLabSandboxPage() {
  const variantNames = Object.keys(BUTTON_VARIANTS) as Array<keyof typeof BUTTON_VARIANTS>;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <PageHeader title="Sandbox" count={RESKIN_GROUPS.length} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-9 px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-2">
            <p className="max-w-3xl text-role-body text-text-muted">
              Every primitive in every variant and state, grouped by the token group that moves it.
              Flip groups with the skin control at bottom-left and watch this page rather than
              navigating the app.
            </p>
            <p className="max-w-3xl text-role-caption text-text-soft">
              Components here are the real ones, imported from their homes and iterated over their
              own declared variant axes — a new Button variant appears the day it ships. Swatches
              are painted straight from <code>var(--ds-color-*)</code>, so they are the token
              itself. Nothing on this page re-implements anything.
            </p>
          </div>

          {/* ---------------------------------------------------- chrome */}
          <Section group="chrome" title="Chrome planes">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SURFACES.map(([token, label]) => (
                <Swatch key={token} token={token} label={label} />
              ))}
            </div>
            <div className="mt-1 border border-border-soft bg-surface-canvas p-4">
              <div className="border border-border-soft bg-surface-card p-4">
                <div className="border border-border-soft bg-surface-sunken p-4 text-role-caption text-text-muted">
                  canvas → card → sunken, nested. If two of these collapse into one value, a raised
                  surface has no ground to sit on.
                </div>
              </div>
            </div>
          </Section>

          {/* ------------------------------------------------------ text */}
          <Section group="text" title="Text ramp">
            <div className="flex flex-col gap-1.5 border border-border-soft bg-surface-card p-4">
              {TEXT_RUNGS.map(([token, label]) => (
                <div key={token} className="flex items-baseline gap-3">
                  <span className="w-20 shrink-0 text-role-micro text-text-faint">{label}</span>
                  <span className="text-role-body" style={{ color: `var(${token})` }}>
                    Forty cartons, twelve landed, one exception.
                  </span>
                  <span
                    className="font-mono text-role-caption tabular-nums"
                    style={{ color: `var(${token})` }}
                  >
                    8Q2K-77A1
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* ----------------------------------------------------- rules */}
          <Section group="rules" title="Rules">
            <div className="flex flex-col gap-3 border border-border-soft bg-surface-card p-4">
              {RULES.map(([token, label]) => (
                <div key={token} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-role-micro text-text-faint">{label}</span>
                  <span className="h-px flex-1" style={{ background: `var(${token})` }} />
                </div>
              ))}
            </div>
          </Section>

          {/* ---------------------------------------------------- status */}
          <Section group="status" title="Status tones">
            <div className="grid gap-3 sm:grid-cols-4">
              {TONES.map((tone) => (
                <div
                  key={tone}
                  className="flex flex-col gap-2 border p-3"
                  style={{
                    background: `var(--ds-color-surface-${tone})`,
                    borderColor: `var(--ds-color-border-${tone})`,
                  }}
                >
                  <span
                    className="text-role-caption font-medium"
                    style={{ color: `var(--ds-color-text-${tone})` }}
                  >
                    {tone}
                  </span>
                  <span className="text-role-micro text-text-muted">tint · edge · ink</span>
                </div>
              ))}
            </div>
            <Cell label="Badge — every declared variant">
              <div className="flex flex-wrap gap-2">
                {BADGE_VARIANTS.map((v) => (
                  <Badge key={v} variant={v}>
                    {v}
                  </Badge>
                ))}
              </div>
            </Cell>
            <div className="flex flex-col gap-2">
              {ALERT_VARIANTS.map((v) => (
                <Alert key={v} variant={v}>
                  <AlertTitle>{v}</AlertTitle>
                  <AlertDescription>
                    Serial 8Q2K-77A1 has no matching purchase order line.
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </Section>

          {/* ---------------------------------------------------- accent */}
          <Section group="accent" title="Accent, controls and focus">
            <Cell label="design-system Button — every variant, every size">
              <div className="flex flex-col gap-2">
                {BUTTON_SIZES.map((size) => (
                  <div key={size} className="flex flex-wrap items-center gap-2">
                    <span className="w-6 text-role-micro text-text-faint">{size}</span>
                    {variantNames.map((v) => (
                      <Button key={v} variant={v} size={size}>
                        {v}
                      </Button>
                    ))}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-role-micro text-text-faint">off</span>
                  {variantNames.map((v) => (
                    <Button key={v} variant={v} disabled>
                      {v}
                    </Button>
                  ))}
                </div>
              </div>
            </Cell>

            <Cell label="ui/button — the chrome lane">
              <div className="flex flex-wrap items-center gap-2">
                {CHROME_VARIANTS.map((v) => (
                  <ChromeButton key={v} variant={v} size="sm">
                    {v}
                  </ChromeButton>
                ))}
                <ChromeButton variant="ghost" size="sm" disabled>
                  disabled
                </ChromeButton>
              </div>
            </Cell>

            <div className="grid gap-4 sm:grid-cols-2">
              <Cell label="Input — rest, focus ring, disabled">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="sb-a">Serial</Label>
                    <Input id="sb-a" placeholder="Scan or type a serial" />
                  </div>
                  <Input
                    placeholder="Focus ring (forced)"
                    className="outline outline-2 outline-offset-1 outline-edge-accent"
                    readOnly
                  />
                  <Input placeholder="Disabled" disabled />
                </div>
              </Cell>
              <Cell label="Checkbox and selection wash">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox id="sb-c1" defaultChecked />
                    <Label htmlFor="sb-c1">Checked</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="sb-c2" />
                    <Label htmlFor="sb-c2">Unchecked</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="sb-c3" disabled />
                    <Label htmlFor="sb-c3">Disabled</Label>
                  </div>
                  <div
                    className="mt-1 border border-border-soft p-2 text-role-caption text-text-muted"
                    style={{ background: 'var(--ds-color-accent-light)' }}
                  >
                    Selected row wash — <code>--ds-color-accent-light</code>
                  </div>
                </div>
              </Cell>
            </div>
          </Section>

          {/* ----------------------------------------------------- bench */}
          <Section group="bench" title="Bench wells">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BENCH.map(([token, label]) => (
                <Swatch key={token} token={token} label={label} />
              ))}
            </div>
            <div
              className="border p-3"
              style={{
                background: 'var(--ds-color-surface-bench)',
                borderColor: 'var(--ds-color-border-stain)',
              }}
            >
              <div
                className="border p-3"
                style={{
                  background: 'var(--ds-color-surface-trough)',
                  borderColor: 'var(--ds-color-border-stain)',
                }}
              >
                <div
                  className="border p-2 text-role-caption"
                  style={{
                    background: 'var(--ds-color-surface-plate)',
                    borderColor: 'var(--ds-color-border-ply)',
                    color: 'var(--ds-color-text-primary)',
                  }}
                >
                  bench → trough → plate. This is the station mouth&rsquo;s material stack.
                </div>
              </div>
            </div>
          </Section>

          {/* --------------------------------------------------- inverse */}
          <Section group="inverse" title="Inverse chrome">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {INVERSE.map(([token, label]) => (
                <Swatch key={token} token={token} label={label} />
              ))}
            </div>
            <div
              className="flex flex-wrap items-center gap-3 p-3"
              style={{ background: 'var(--ds-color-surface-inverse)' }}
            >
              <span style={{ color: 'var(--ds-color-text-inverse)' }} className="text-role-caption">
                Primary ink on an inverse bar
              </span>
              <span
                style={{ color: 'var(--ds-color-text-inverse-soft)' }}
                className="text-role-caption"
              >
                secondary ink
              </span>
              <span
                className="px-2 py-0.5 text-role-micro"
                style={{
                  background: 'var(--ds-color-surface-inverse-raised)',
                  color: 'var(--ds-color-text-inverse)',
                }}
              >
                chip on the bar
              </span>
            </div>
          </Section>

          {/* ----------------------------------------------------- fills */}
          <Section group="fills" title="Solid fills">
            <div className="flex flex-col gap-2 border border-border-soft bg-surface-card p-4">
              {FILLS.map(([token, label]) => (
                <div key={token} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-role-micro text-text-faint">{label}</span>
                  <span className="h-2 flex-1 bg-surface-sunken">
                    <span
                      className="block h-2"
                      style={{ width: '62%', background: `var(${token})` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* ----------------------------------------------------- paper */}
          <Section group="paper" title="Material">
            <p className="max-w-3xl text-role-caption text-text-soft">
              The tooth paints on the ground plane only, so it sits <em>behind</em> every panel on
              this page. Scroll to a gap between cards, or open a route with an exposed canvas, to
              read it. That is the point: texture never lands behind a data row.
            </p>
            <div className="flex gap-3">
              <div className="h-24 flex-1 border border-border-soft bg-surface-card" />
              <div className="h-24 w-24 shrink-0" aria-hidden />
              <div className="h-24 flex-1 border border-border-soft bg-surface-card" />
            </div>
            <span className="text-role-micro text-text-faint">
              The gap between those two cards is bare ground.
            </span>
          </Section>

          {/* ------------------------------------------------- structure */}
          <Section title="Loading, empty and separators">
            <div className="grid gap-4 sm:grid-cols-2">
              <Cell label="Skeleton">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </Cell>
              <Cell label="Separator">
                <div className="flex flex-col gap-3">
                  <span className="text-role-caption text-text-muted">above</span>
                  <Separator />
                  <span className="text-role-caption text-text-muted">below</span>
                </div>
              </Cell>
            </div>
          </Section>

          {/* --------------------------------------------------- density */}
          <Section title="Row density — the one thing texture must never touch">
            <div className="border border-border-soft bg-surface-card">
              {[
                ['Dell Latitude 5440 · 16GB', 'Packed', 'Sep 03', '…4F91D2A7'],
                ['iPad Air 5 · 256GB', 'Picking', 'Sep 02', '…88C0E1B3'],
                ['Logitech MX Keys · lot of 6', 'Exception', 'Sep 04', '…1A2B3C4D'],
                ['ThinkPad T14 Gen 3 · no charger', 'Ready', 'Sep 05', '…7E6F5A90'],
              ].map(([item, status, due, order], i) => (
                <div
                  key={order}
                  className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.9fr] items-center gap-3 border-b border-border-soft px-3 py-2 last:border-b-0"
                  style={i === 1 ? { background: 'var(--ds-color-accent-light)' } : undefined}
                >
                  <span className="truncate text-role-caption text-text-default">{item}</span>
                  <span className="text-role-micro text-text-muted">{status}</span>
                  <span className="font-mono text-role-micro tabular-nums text-text-muted">
                    {due}
                  </span>
                  <span className="font-mono text-role-micro tabular-nums text-text-muted">
                    {order}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-role-micro text-text-faint">
              Mono, tabular, on a clean surface. If a serial is hard to read here, the skin is wrong.
            </span>
          </Section>
        </div>
      </main>
    </div>
  );
}

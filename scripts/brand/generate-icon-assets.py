#!/usr/bin/env python3
"""CycleForge brand icon system — canonical geometry generator.

Regenerates every brand asset deterministically from the numbers below.
Edit the GEOMETRY / PALETTE blocks, run, then rasterize (commands at bottom).

System: "The Hammer & the Light" — see docs/brand/icon.md
  favicon   hammer + status LED, no ring          (16-32px tab life)
  full      ring + hammer + green LED             (PWA / desktop / lockup)
  loading   clock-hand hammer pivoted at ring center, amber LED
            (CSS cf-boot-strike swings 12->3; rest pose = 45)

Usage:
  python3 scripts/brand/generate-icon-assets.py          # writes SVGs to /tmp/cf-brand/out
  python3 scripts/brand/generate-icon-assets.py --out public
Rasterize + cut into repo (from repo root):
  rsvg-convert -w 64   -h 64   $SRC/favicon-master.svg  -o public/favicon.png
  rsvg-convert -w 192  -h 192  $SRC/master.svg          -o public/icon-192.png
  rsvg-convert -w 512  -h 512  $SRC/master-square.svg   -o public/icon-512.png
  rsvg-convert -w 180  -h 180  $SRC/master-square.svg   -o public/apple-touch-icon.png
  rsvg-convert -w 1024 -h 1024 $SRC/master-square.svg   -o build/icon.png
QA the small sizes (16px is the bar; presence beats anatomy):
  rsvg-convert -w 16 -h 16 $SRC/favicon-master.svg -o /tmp/f16.png
"""
import argparse
import math
import os

# ── PALETTE ──────────────────────────────────────────────────────────────
# Shipped "bright build". The Figma direction (dark) swaps:
#   BLUE->#0f172a ground, hammer/ring ->#22d3ee cyan, LED stays green/amber.
BLUE = "#2563eb"      # tile + hammer keyline (product scan blue)
ORANGE_D = "#ea580c"  # hammer head (system warning orange)
ORANGE = "#f97316"    # striking face band
GREEN = "#16a34a"     # status LED, DONE/passed (system success)
AMBER = "#fbbf24"     # status LED, loading/working
WHITE = "#ffffff"     # ring + LED bezel
NAVY = "#1a3a6b"      # single-ink letterhead variant
INK = "#0f172a"       # wordmark ink

# ── GEOMETRY (512 grid) ──────────────────────────────────────────────────
R, SW = 150.0, 44.0   # ring centerline radius / stroke
S = 1.14              # hammer scale
CORNER = 118          # squircle corner radius
MASK_SCALE = 0.85     # full-bleed safe-zone scale (spark/LED margin)
# hammer, built axis-aligned (head up), rotated 45 for the strike pose:
HEAD_W, HEAD_H = 176 * S, 104 * S
HANDLE_W, HANDLE_L = 50 * S, 236 * S
HEAD_OFF = R - 56 * S  # head center distance above icon center
# favicon LED is oversized (only state that registers at 16px):
LED_FAV, LED_FULL = 34, 28
BEZEL = 14
# loading pose (clock hand): head radial near ring, short handle to pivot
LH_HANDLE_W, LH_HANDLE_L = 40, 118
LH_HEAD_W, LH_HEAD_H = 172, 108

C = 256.0


def hammer_shapes():
    hcy = C - HEAD_OFF
    ht = hcy + HEAD_H / 2 - 10 * S
    return hcy, ht


def hammer_45(fill, key, kw=16, face=None):
    hcy, ht = hammer_shapes()
    ka = f' stroke="{key}" stroke-width="{kw}" stroke-linejoin="round"'
    f = ""
    if face:
        f = (f'<rect x="{C - HEAD_W/2:.2f}" y="{hcy - HEAD_H/2:.2f}" '
             f'width="{36*S:.2f}" height="{HEAD_H:.2f}" rx="30" fill="{face}"/>')
    return (
        f'<g transform="rotate(45 256 256)"><g fill="{fill}"{ka}>'
        f'<rect x="{C - HANDLE_W/2:.2f}" y="{ht:.2f}" width="{HANDLE_W:.2f}" '
        f'height="{HANDLE_L:.2f}" rx="{HANDLE_W/2:.2f}"/>'
        f'<rect x="{C - HEAD_W/2:.2f}" y="{hcy - HEAD_H/2:.2f}" width="{HEAD_W:.2f}" '
        f'height="{HEAD_H:.2f}" rx="30"/></g>{f}</g>')


def head_center_45():
    hcy = C - HEAD_OFF
    rad = math.radians(45)
    return (C + (C - C) * math.cos(rad) - (hcy - C) * math.sin(rad),
            C + (C - C) * math.sin(rad) + (hcy - C) * math.cos(rad))


def led(cx, cy, r, fill, bezel=BEZEL):
    return (f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r + bezel/2:.2f}" fill="{WHITE}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{fill}"/>')


def doc(body, tile=BLUE, rx=CORNER):
    if tile is None:
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{body}</svg>'
    rect = (f'<rect width="512" height="512" rx="{rx}" fill="{tile}"/>' if rx is not None
            else f'<rect width="512" height="512" fill="{tile}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{rect}{body}</svg>'


RING = f'<circle cx="{C}" cy="{C}" r="{R}" fill="none" stroke="{WHITE}" stroke-width="{SW}"/>'
hx, hy = head_center_45()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/cf-brand/out")
    ap.add_argument("--theme", choices=["bright", "dark"], default="bright",
                    help="dark = Figma direction: #0f172a ground, cyan mark")
    args = ap.parse_args()
    os.makedirs(f"{args.out}/brand", exist_ok=True)
    w = lambda p, b: open(os.path.join(args.out, p), "w").write(b)

    global BLUE, ORANGE_D, ORANGE, WHITE
    if args.theme == "dark":
        BLUE, ORANGE_D, ORANGE, WHITE = "#0f172a", "#22d3ee", "#67e8f9", "#22d3ee"
        # NOTE: dark theme keyline must stay the GROUND color for separation,
        # and the ring must contrast the ground: cyan ring on near-black.
        # LED bezel stays white for the status read.

    # favicon master — simplified, NO ring (16px QA: ring collapses hammer)
    FAV = hammer_45(ORANGE_D, BLUE, face=ORANGE) + led(hx, hy, LED_FAV, GREEN, bezel=16)
    w("favicon-master.svg", doc(FAV))

    # full master — ring + hammer + balanced LED
    FULL = RING + hammer_45(ORANGE_D, BLUE, face=ORANGE) + led(hx, hy, LED_FULL, GREEN)
    w("master.svg", doc(FULL))
    w("master-square.svg",
      f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
      f'<rect width="512" height="512" fill="{BLUE}"/>'
      f'<g transform="translate(256 256) scale({MASK_SCALE}) translate(-256 -256)">{FULL}</g></svg>')

    # loading pose — clock-hand hammer, amber LED; mirrors BootSplash.tsx inline SVG
    LOADING = (
        RING
        + f'<g class="cf-hammer" transform="rotate(45 256 256)" '
          f'style="transform-box:fill-box;transform-origin:50% 100%">'
        + f'<g fill="{ORANGE_D}" stroke="{BLUE}" stroke-width="14" stroke-linejoin="round">'
        + f'<rect x="{256 - LH_HANDLE_W/2}" y="150" width="{LH_HANDLE_W}" height="{LH_HANDLE_L}" rx="{LH_HANDLE_W/2}"/>'
        + f'<rect x="{256 - LH_HEAD_W/2}" y="90" width="{LH_HEAD_W}" height="{LH_HEAD_H}" rx="28"/></g>'
        + f'<rect x="{256 - LH_HEAD_W/2}" y="90" width="34" height="{LH_HEAD_H}" rx="14" fill="{ORANGE}"/>'
        + f'<circle cx="256" cy="144" r="32" fill="#ffffff"/>'
        + f'<circle cx="256" cy="144" r="26" fill="{AMBER}"/></g>'
    )
    w("brand/loading-mark.svg", doc(LOADING))

    # single-ink letterhead mark
    mono = (
        f'<circle cx="{C}" cy="{C}" r="{R}" fill="none" stroke="{NAVY}" stroke-width="{SW}"/>'
        + hammer_45(NAVY, "#ffffff")
        + led(hx, hy, LED_FULL, NAVY, bezel=BEZEL)
    )
    w("brand/mark.svg", doc(mono, tile=None))

    # lockup
    w("brand/lockup-horizontal.svg",
      f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1520 512">'
      f'<rect width="512" height="512" rx="{CORNER}" fill="{BLUE}"/>{FULL}'
      f'<text x="600" y="328" fill="{INK}" font-family="Inter, system-ui, sans-serif" '
      f'font-size="196" font-weight="600" letter-spacing="-4">Cycle Forge</text></svg>')

    # hero (marketing/letterhead ONLY, never favicon): same mark + soft glow
    # + radial vignette. Glow is a separate blurred duplicate of the mark so
    # the flat favicon/PWA exports simply omit this file.
    glow_color = "#22d3ee" if args.theme == "dark" else "#60a5fa"
    HERO = (
        f'<radialGradient id="v" cx="50%" cy="42%" r="75%">'
        f'<stop offset="0%" stop-color="{glow_color}" stop-opacity="{0.14 if args.theme == "dark" else 0.10}"/>'
        f'<stop offset="100%" stop-color="{glow_color}" stop-opacity="0"/></radialGradient>'
        f'<filter id="g" x="-40%" y="-40%" width="180%" height="180%">'
        f'<feGaussianBlur stdDeviation="18"/></filter>'
        f'<g filter="url(#g)" opacity="0.55">{FULL}</g>'
        f'<rect width="512" height="512" fill="url(#v)"/>{FULL}'
    )
    w("brand/hero.svg", doc(HERO))

    print(f"wrote SVG masters to {args.out} (theme={args.theme})")


if __name__ == "__main__":
    main()

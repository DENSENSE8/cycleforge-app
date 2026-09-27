/**
 * The welcome's resting frame, shared by its three renderers so they cannot
 * drift: BOOT_SPLASH_SCRIPT (pre-hydration, below), WelcomeBridge (/signin
 * 'signingIn') and WelcomeAssembly (the animated overlay on Daily). The frame
 * is the staff-tinted lobby ground, the active theme's ambient shapes at rest
 * (AmbientLayerStatic / serializeWelcomeTheme), and the frosted greeting
 * card: avatar (photo or initials) in its staff-colour ring, "{greeting},
 * {name}", and the soft weekday line. Materials live in the `cf-welcome-*`
 * block of src/app/globals.css.
 */
import {
  WELCOME_THEMES,
  serializeWelcomeTheme,
  type SerializedWelcomeTheme,
  type WelcomeTheme,
} from '@/components/boot/welcome/welcome-theme';
import { PHASE, ms } from '@/components/boot/welcome/motion-grammar';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';

export const WELCOME_ROOT_CLASS = 'cf-welcome-root fixed inset-0 z-splash select-none overflow-hidden text-text-default';
/** Staff-tinted ground; also the fill of every region veil. */
export const WELCOME_GROUND_CLASS = 'cf-welcome-ground pointer-events-none absolute inset-0';
export const WELCOME_GROUND_GRAIN_CLASS = 'cf-welcome-grain absolute inset-0 opacity-40';
export const WELCOME_STAGE_CLASS = 'pointer-events-none absolute inset-0 flex items-center justify-center px-6';
export const WELCOME_CARD_CLASS = 'cf-welcome-card relative overflow-hidden px-12 pb-10 pt-9 text-center';
/** Backdrop frost — at rest only; WelcomeAssembly drops it before the card moves. */
export const WELCOME_FROST_CLASS = 'cf-welcome-frost';
export const WELCOME_CARD_GRAIN_CLASS = 'cf-welcome-grain absolute inset-0 opacity-40';
export const WELCOME_COLUMN_CLASS = 'relative flex flex-col items-center gap-4';
/** The avatar's slot; the static renderers add WELCOME_AVATAR_RING_CLASS, WelcomeAssembly's spotlight draws the same ring. */
export const WELCOME_AVATAR_SLOT_CLASS = 'mb-1 block rounded-full';
export const WELCOME_AVATAR_RING_CLASS = 'cf-welcome-avatar-ring';
/** One line of inline text: "{greeting}" then the tail ", {name}" — the tail is what leaves first. */
export const WELCOME_HEADLINE_CLASS = 'text-balance text-4xl font-semibold tracking-tight sm:text-5xl';
/** The tail's leading ", " (the comma leaves with the name). */
export const WELCOME_TAIL_SEPARATOR = ', ';
/** The name's box: the glow (filter, never animated) and the glint's anchor. */
export const WELCOME_NAME_GLOW_CLASS = 'cf-welcome-name-glow relative inline-block';
/** The name's metallic ink — on the whole name at rest, on each glyph when split (vertical gradient: identical). */
export const WELCOME_NAME_INK_CLASS = 'cf-welcome-name-ink';
/** The glint's own clip, so the glint is masked to the name without clipping the glyphs' motion. */
export const WELCOME_GLINT_CLIP_CLASS = 'pointer-events-none absolute inset-0 overflow-hidden';
export const WELCOME_SOFT_LINE_CLASS = 'text-base text-text-muted tabular-nums';
/** IdentityMark's own classes for `size="2xl" ring={false}` (round face) — mirrored only for the pre-hydration DOM. */
const IDENTITY_MARK_2XL_CLASS =
  'relative flex shrink-0 items-center justify-center overflow-hidden text-white rounded-full font-semibold h-20 w-20 text-2xl';
const IDENTITY_MARK_IMG_CLASS = 'h-full w-full object-cover';

/** Today's weekday in the warehouse zone (the zone every Daily count is keyed in). */
export function welcomeWeekday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: WAREHOUSE_TIME_ZONE }).format(now);
}

export function welcomeStatusText(greeting: string, name: string | null | undefined): string {
  return name ? `${greeting}, ${name}. Assembling your workspace.` : `${greeting}. Assembling your workspace.`;
}

const js = JSON.stringify;

/** Every theme's resting frame, baked into the script at build time (no runtime module import). */
const THEME_FRAMES: Record<WelcomeTheme['id'], { greeting: string; frame: SerializedWelcomeTheme }> = Object.fromEntries(
  Object.values(WELCOME_THEMES).map((theme) => [
    theme.id,
    { greeting: theme.greeting, frame: JSON.parse(serializeWelcomeTheme(theme)) as SerializedWelcomeTheme },
  ]),
) as Record<WelcomeTheme['id'], { greeting: string; frame: SerializedWelcomeTheme }>;

/**
 * Pre-hydration welcome bridge: paints the resting frame above (same Tailwind
 * + `cf-welcome-*` classes, which the render-blocking globals.css already
 * provides) before React hydrates the landing page, so sign-in → hard nav →
 * WelcomeAssembly reads as one screen. Runs on the armed flag or `?welcome=1`
 * on any path. Name / colour / avatar / initials /
 * theme come from `cf:welcome-staff` (armBootSplash): text is set via
 * textContent only, the colour must be `#rrggbb`, the avatar only when it is a
 * same-origin relative URL, the theme only when it is a known id (outside
 * production `?welcomeTheme=` wins, as in resolveWelcomeTheme). WelcomeHost
 * removes `__boot_splash_pre` on mount; 10s safety removal.
 */
export const BOOT_SPLASH_SCRIPT = `(function(){
  try {
    var welcomeParam = /[?&]welcome=1(&|$)/.test(location.search);
    if (!welcomeParam && sessionStorage.getItem('cf:boot-splash') !== '1' && sessionStorage.getItem('usav:boot-splash') !== '1') return;
    var ID = '__boot_splash_pre';
    if (document.getElementById(ID)) return;
    var THEMES = ${js(THEME_FRAMES)};
    var name = null, color = '#64748b', avatar = null, initials = '', themeId = 'default';
    try {
      var staff = JSON.parse(sessionStorage.getItem('cf:welcome-staff') || 'null');
      if (staff && typeof staff.name === 'string' && staff.name.trim()) name = staff.name.trim();
      if (staff && typeof staff.colorHex === 'string' && /^#[0-9a-f]{6}$/i.test(staff.colorHex)) color = staff.colorHex;
      if (staff && typeof staff.avatarUrl === 'string' && staff.avatarUrl.charAt(0) === '/' && staff.avatarUrl.charAt(1) !== '/' && staff.avatarUrl.indexOf('\\\\') < 0) avatar = staff.avatarUrl;
      if (staff && typeof staff.initials === 'string') initials = staff.initials.trim().slice(0, 3);
      if (staff && typeof staff.themeId === 'string' && Object.prototype.hasOwnProperty.call(THEMES, staff.themeId)) themeId = staff.themeId;
    } catch (e) {}
    if (${js(process.env.NODE_ENV !== 'production')}) {
      var forced = /[?&]welcomeTheme=([a-z-]+)/.exec(location.search);
      if (forced && Object.prototype.hasOwnProperty.call(THEMES, forced[1])) themeId = forced[1];
    }
    var theme = THEMES[themeId];
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    }
    function styled(n, style) { for (var k in style) n.style.setProperty(k, style[k]); return n; }
    function lin(c) { c = c / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var rgb = parseInt(color.slice(1), 16);
    var lum = 0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255);
    var ink = (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
    var weekday = '';
    try { weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: ${js(WAREHOUSE_TIME_ZONE)} }).format(new Date()); } catch (e) {}
    var root = styled(el('div', ${js(WELCOME_ROOT_CLASS)}), theme.frame.vars);
    root.id = ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('--cf-welcome-name', color);
    var ground = el('div', ${js(WELCOME_GROUND_CLASS)});
    ground.appendChild(el('div', ${js(WELCOME_GROUND_GRAIN_CLASS)}));
    root.appendChild(ground);
    var layer = el('div', theme.frame.layerClass);
    theme.frame.shapes.forEach(function(s){
      var shape = styled(el('div', s.className), s.style);
      if (s.svg) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('aria-hidden', 'true');
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', s.svg.d);
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
        shape.appendChild(svg);
      }
      layer.appendChild(shape);
    });
    root.appendChild(layer);
    var stage = el('div', ${js(WELCOME_STAGE_CLASS)});
    var card = el('div', ${js(`${WELCOME_CARD_CLASS} ${WELCOME_FROST_CLASS}`)});
    card.appendChild(el('div', ${js(WELCOME_CARD_GRAIN_CLASS)}));
    var col = el('div', ${js(WELCOME_COLUMN_CLASS)});
    var slot = el('span', ${js(`${WELCOME_AVATAR_SLOT_CLASS} ${WELCOME_AVATAR_RING_CLASS}`)});
    var mark = el('span', ${js(IDENTITY_MARK_2XL_CLASS)});
    function initialsFace() {
      mark.textContent = initials;
      mark.style.backgroundColor = color;
      mark.style.color = ink;
    }
    if (avatar) {
      var img = el('img', ${js(IDENTITY_MARK_IMG_CLASS)});
      img.alt = '';
      img.draggable = false;
      img.onerror = function(){ if (img.parentNode) img.parentNode.removeChild(img); initialsFace(); };
      img.src = avatar;
      mark.appendChild(img);
    } else {
      initialsFace();
    }
    slot.appendChild(mark);
    col.appendChild(slot);
    var line = el('p', ${js(WELCOME_HEADLINE_CLASS)});
    line.appendChild(el('span', '', theme.greeting));
    if (name) {
      var tail = el('span', '', ${js(WELCOME_TAIL_SEPARATOR)});
      var glow = el('span', ${js(WELCOME_NAME_GLOW_CLASS)});
      glow.appendChild(el('span', ${js(WELCOME_NAME_INK_CLASS)}, name));
      tail.appendChild(glow);
      line.appendChild(tail);
    }
    col.appendChild(line);
    col.appendChild(el('p', ${js(WELCOME_SOFT_LINE_CLASS)}, weekday));
    card.appendChild(col);
    stage.appendChild(card);
    root.appendChild(stage);
    (document.body || document.documentElement).appendChild(root);
    setTimeout(function(){ var n = document.getElementById(ID); if (n) n.remove(); }, ${js(ms(PHASE.BOOT_BRIDGE_SAFETY))});
  } catch (e) {}
})();`;

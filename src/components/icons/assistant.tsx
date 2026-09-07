// Assistant identity glyphs — the ONE place the assistant's mark is drawn.
//
// ## Why this module exists
//
// `Sparkles` was the assistant's face, and it is also the face of "similar
// products", "photo analysed", "suggestions", "AI draft", the onboarding
// template picker and the motion lab — 87 references across 34 files doing at
// least eight unrelated jobs. Editing `Sparkles` to give the assistant a better
// icon would have repainted all of them, so the assistant gets its OWN named
// glyph instead. That is the swap point: change `AskMark` here and every
// surface that speaks for the assistant changes with it, while the sparkle
// keeps its unrelated jobs until each is retired deliberately.
//
// ## Why this shape
//
// The house world is Kinetic Ledger — an operator's workbench, not a magic
// wand. A four-point sparkle is the industry's stock "AI" sticker; it reads
// consumer-toy and says nothing about a warehouse that grades, tests and
// refurbishes hardware for Amazon Renewed. `AskMark` is a machined part: a
// hex bezel with a polished core, the silhouette of a titanium fastener seen
// down the axis and of a lens aperture at the same time. Precision, not magic.
//
// Material comes from GEOMETRY, not texture. A brushed-aluminium gradient or a
// carbon-fibre weave inside a 14px glyph is mud on a real screen; the premium
// read at that size comes from the 30°/60° facets, the tight bezel-to-core
// ratio, and one stroke weight held everywhere. The warm/neutral ink the
// surface already carries (`text-gilt`, `text-muted`) supplies the metal.
//
// Stroke is 1.8, not the module-wide 2: at 14px the hex facets close up at 2
// and the mark loses its machined edge. Verified at 14 / 16 / 20 / 64px on both
// the light card and the dark scheme before it was chosen.

export const AskMark = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {/* Hex bezel — flats top and bottom, facets on the 30° diagonals. */}
        <path d="M12 2.9 19.9 7.4v9.2L12 21.1 4.1 16.6V7.4L12 2.9Z" />
        {/* Polished core. FILLED, not stroked: a ring at 14px reads as a hole
            in a nut; a solid boss reads as a finished surface. */}
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
);

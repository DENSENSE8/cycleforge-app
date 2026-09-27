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
// ## Why this shape (2026-09-07)
//
// A **chat bubble with a question mark** — Lucide's `message-circle-question-mark`
// geometry, drawn here so the house keeps one owner for the mark. It replaced a
// machined hex bezel (a "titanium fastener seen down the axis"), which was a
// fine object and the wrong sign: at 14px it read as a polygon, it shared no
// family with the chat bubbles on the session rows beside it, and the operator
// had to learn that this particular polygon meant "conversation".
//
// It marks the ASSISTANT, not a conversation: the composer's Ask mode is the
// consumer (a way of talking to the agent). The threads themselves — the
// spine's New chat row, every session row, a session pin, the header chip —
// wear `MessageSquare`, because a thread is a conversation and not a question
// put to a model (operator 2026-09-07). Two marks, two meanings, and this
// module is still the one place the assistant's is drawn: change it here and
// every surface that speaks for the assistant changes with it.
//
// Stroke is 2, the module-wide weight, not the 1.8 the hex needed to keep its
// facets open. A bubble has no facets to close up, so it takes the same weight
// as every other glyph on the beam and the spine (`navIconStrokeClass` still
// overrides where the nav wants its own).

export const AskMark = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {/* Bubble with its tail at the lower left. */}
        <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
        {/* Question mark: hook and dot, drawn as two strokes so the dot keeps
            its round cap at 14px instead of collapsing into the hook. */}
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
    </svg>
);

// Transcript and composer verbs for the assistant surface (Lucide geometry,
// stroke 2): stop a running turn, rate an answer, jump back to the live end.

/** A running turn's stop glyph — a filled rounded square. */
export const Stop = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
);

export const ThumbsUp = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
);

export const ThumbsDown = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 14V2" />
        <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
);

export const ArrowDown = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
    </svg>
);

/** The answer's thinking — the "Thought process" toggle under a reply (Lucide lightbulb). */
export const Thought = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <path d="M9 18h6" />
        <path d="M10 22h4" />
    </svg>
);

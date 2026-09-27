// Voice / telephony glyphs (Nextiva support modes).
// Generated split of the former flat Icons.tsx (the nav-icon SoT).
// Re-exported verbatim through ../Icons.tsx — do not change export names.

// ── Voice / telephony (Nextiva support modes) ────────────────────────────────

/** Phone — generic call / click-to-call (lucide phone). */
export const Phone = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
);

/** PhoneIncoming — inbound call (arrow into the handset). */
export const PhoneIncoming = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 2v6h6" />
        <path d="m22 2-6 6" />
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
);

/** PhoneOutgoing — outbound call (arrow leaving the handset). */
export const PhoneOutgoing = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 8V2h-6" />
        <path d="m16 8 6-6" />
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
);

/** PhoneMissed — missed call (an X beside the handset). */
export const PhoneMissed = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m22 2-6 6" />
        <path d="m16 2 6 6" />
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
);

/** Voicemail — two coils + baseline (lucide voicemail). */
export const Voicemail = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="4" />
        <circle cx="18" cy="12" r="4" />
        <line x1="6" x2="18" y1="16" y2="16" />
    </svg>
);

/** Mic — dictation on (lucide mic). Companion composer voice input. */
export const Mic = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
);

/** MicOff — dictation unavailable / muted (lucide mic-off). */
export const MicOff = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" x2="22" y1="2" y2="22" />
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
        <path d="M5 10v2a7 7 0 0 0 12 5" />
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
        <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
);

/**
 * Motion tokens for Pulse, shared by CSS (globals.css) and the motion library.
 * One settling curve, no bounce. Things answer what the person did; nothing loops
 * except the live heartbeat. "Reduce motion" on the device turns it all off.
 */
export const EASE_SETTLE = [0.22, 1, 0.36, 1] as const;
export const EASE_EXIT = [0.4, 0, 0.84, 0.6] as const;

/** an indicator gliding to its new place (tabs, nav, segmented controls) */
export const GLIDE = { type: "spring", stiffness: 520, damping: 44, mass: 0.9 } as const;

/** a list row settling into place */
export const SETTLE = { duration: 0.32, ease: EASE_SETTLE } as const;

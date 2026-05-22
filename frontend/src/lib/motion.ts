import type { Transition, Variants } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════════
   Apple-style spring presets
   Tuned to feel like UIView spring animations / SwiftUI defaults.
   ═══════════════════════════════════════════════════════════════════ */

export const spring = {
  /** Crisp, decisive — for active-state pills and selection indicators */
  snappy:   { type: 'spring' as const, stiffness: 540, damping: 38, mass: 0.9 },
  /** Default for hover/lift — gentle settle */
  smooth:   { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9 },
  /** Soft, emotive — for entries and reveals */
  soft:     { type: 'spring' as const, stiffness: 220, damping: 28, mass: 1.0 },
  /** Bouncy, used sparingly — for delightful confirmations */
  bouncy:   { type: 'spring' as const, stiffness: 480, damping: 22, mass: 0.9 },
  /** Page-level transitions */
  page:     { type: 'spring' as const, stiffness: 280, damping: 34, mass: 0.95 },
} satisfies Record<string, Transition>;

/** Apple emphasized cubic — for non-spring tweens (size/color crossfades) */
export const easing = {
  emphasized:  [0.32, 0.72, 0, 1] as [number, number, number, number],
  outSoft:     [0.16, 1, 0.3, 1] as [number, number, number, number],
  outQuint:    [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOutQuart:  [0.76, 0, 0.24, 1] as [number, number, number, number],
};

/* ═══════════════════════════════════════════════════════════════════
   Reusable variants
   ═══════════════════════════════════════════════════════════════════ */

export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: spring.soft },
  exit:    { opacity: 0, y: -10, transition: { duration: 0.20, ease: easing.inOutQuart } },
};

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35, ease: easing.outSoft } },
  exit:    { opacity: 0, transition: { duration: 0.18, ease: easing.inOutQuart } },
};

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: spring.smooth },
  exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: easing.inOutQuart } },
};

/** Page-level transition: content lifts in on route change. */
export const pageTransition: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: spring.page },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.22, ease: easing.inOutQuart } },
};

/** Stagger container — gives children a smooth cascade */
export const stagger = (delay = 0.04, initial = 0): Variants => ({
  hidden:  {},
  visible: { transition: { staggerChildren: delay, delayChildren: initial } },
});

/** Hover lift — for cards/tiles. Compose with whileHover. */
export const hoverLift = {
  rest:  { y: 0, scale: 1, transition: spring.smooth },
  hover: { y: -2, scale: 1.005, transition: spring.smooth },
};

/** Tap response — for any pressable element */
export const tapPress = {
  scale: 0.97,
  transition: spring.snappy,
};

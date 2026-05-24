/* Hallmark · component: aurora-background · genre: atmospheric · theme: iTOps brand
 * states: default (decorative — no interactive states required)
 * contrast: pass (decorative layer; sits behind text in landing hero)
 */
import { cn } from '@/lib/utils';
import type { ReactNode, HTMLProps } from 'react';

interface AuroraBackgroundProps extends HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

/**
 * Animated aurora gradient backdrop, scoped to a single section (typically a
 * landing hero). The lens itself is decorative — `pointer-events: none` so
 * clicks pass through. The 60s background-position loop is the only motion;
 * collapses under `prefers-reduced-motion` via Tailwind's `motion-safe`.
 */
export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center bg-[var(--color-canvas)] text-[var(--color-ink)] transition-bg',
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className={cn(
            // Two repeating linear-gradient layers — a soft white veil
            // (lifts the aurora off the canvas) plus the aurora itself,
            // which animates by sliding its background-position.
            '[--white-gradient:repeating-linear-gradient(100deg,var(--aurora-white)_0%,var(--aurora-white)_7%,var(--aurora-transparent)_10%,var(--aurora-transparent)_12%,var(--aurora-white)_16%)]',
            '[--aurora:repeating-linear-gradient(100deg,var(--aurora-blue-500)_10%,var(--aurora-indigo-300)_15%,var(--aurora-blue-300)_20%,var(--aurora-violet-200)_25%,var(--aurora-blue-400)_30%)]',
            '[background-image:var(--white-gradient),var(--aurora)]',
            '[background-size:300%,_200%]',
            '[background-position:50%_50%,50%_50%]',
            'filter blur-[10px] invert',
            'after:content-[""] after:absolute after:inset-0',
            'after:[background-image:var(--white-gradient),var(--aurora)]',
            'after:[background-size:200%,_100%]',
            'motion-safe:after:animate-aurora',
            'after:[background-attachment:fixed]',
            'after:mix-blend-difference',
            'pointer-events-none absolute -inset-[10px] opacity-50 will-change-transform',
            showRadialGradient &&
              '[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--aurora-transparent)_70%)]',
          )}
        />
      </div>
      {children}
    </div>
  );
};

import { motion, useMotionValue, useTransform, useSpring, useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { spring, fadeUp } from '../../lib/motion';

type Glow = 'green' | 'red' | 'amber' | 'none';

interface Props {
  children: ReactNode;
  className?: string;
  glow?: Glow;
  hover?: boolean;
  onClick?: () => void;
  /** subtle cursor-tracked tilt; off by default to avoid distraction */
  tilt?: boolean;
}

const GLOW_CLASS: Record<Glow, string> = {
  green: 'glow-green',
  red:   'glow-red',
  amber: 'glow-amber',
  none:  '',
};

/**
 * GlassCard
 * - Frosted .glass base + cursor-tracked specular sheen
 * - Spring-lifted on hover (Apple smooth)
 * - Optional tilt: ±2.5° rotation tracking the cursor (GPU transforms only)
 * - Honors prefers-reduced-motion: tilt + lift are gated off via
 *   useReducedMotion (manual motion-value bindings aren't covered by the
 *   app-level MotionConfig, so we check explicitly here).
 */
export default function GlassCard({
  children,
  className = '',
  glow = 'none',
  hover = true,
  onClick,
  tilt = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const tiltOn = tilt && !reduce;

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  // Spring-smoothed pointer position drives both tilt and sheen
  const sx = useSpring(mx, { stiffness: 220, damping: 28, mass: 0.8 });
  const sy = useSpring(my, { stiffness: 220, damping: 28, mass: 0.8 });

  const rotateY = useTransform(sx, [0, 1], tiltOn ? [2.5, -2.5] : [0, 0]);
  const rotateX = useTransform(sy, [0, 1], tiltOn ? [-2, 2] : [0, 0]);

  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    if (tiltOn) { mx.set(px); my.set(py); }
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };

  const handleLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      whileHover={hover && !reduce ? { y: -2, scale: 1.004 } : undefined}
      transition={spring.smooth}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1100,
        transformStyle: 'preserve-3d',
      }}
      className={`glass glass-cursor-sheen gpu p-6 ${GLOW_CLASS[glow]} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}

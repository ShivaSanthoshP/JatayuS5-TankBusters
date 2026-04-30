import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';

type Variant = 'ghost' | 'solid' | 'accent';

interface Props {
  variant?: Variant;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

const VARIANT_CLASS: Record<Variant, string> = {
  ghost:  'btn-pill btn-pill-ghost btn-magnetic',
  solid:  'btn-pill btn-pill-solid btn-magnetic',
  accent: 'btn-pill btn-pill-accent btn-magnetic',
};

/**
 * Magnetic button — subtly tracks the cursor for a "pulled toward" feel,
 * presses down on tap, springs back. Lights a soft sheen via CSS vars.
 */
export default function MagneticButton({
  variant = 'ghost',
  onClick,
  className = '',
  children,
  disabled,
  type = 'button',
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.18;
    const dy = (e.clientY - cy) * 0.22;
    setPos({ x: dx, y: dy });
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const handleLeave = () => setPos({ x: 0, y: 0 });

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      animate={pos}
      whileTap={{ scale: 0.96 }}
      transition={spring.smooth}
      className={`${VARIANT_CLASS[variant]} ${className}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </motion.button>
  );
}

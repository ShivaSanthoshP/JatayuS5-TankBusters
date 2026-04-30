import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';

interface Props {
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
  active?: boolean;
}

export default function IconButton({ onClick, ariaLabel, className = '', children, active }: Props) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.92 }}
      transition={spring.smooth}
      className={`icon-btn ${className}`}
      style={
        active
          ? { background: 'var(--color-ink)', color: 'var(--color-surface)', borderColor: 'var(--color-ink)' }
          : undefined
      }
    >
      {children}
    </motion.button>
  );
}

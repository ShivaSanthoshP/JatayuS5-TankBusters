import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  glow?: 'green' | 'red' | 'amber' | 'none';
  hover?: boolean;
  onClick?: () => void;
}

export default function GlassCard({ children, className = '', glow = 'none', hover = true, onClick }: Props) {
  const glowClass = glow === 'green' ? 'glow-green' : glow === 'red' ? 'glow-red' : glow === 'amber' ? 'glow-amber' : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={hover ? { scale: 1.015, y: -2 } : undefined}
      onClick={onClick}
      className={`glass p-6 ${glowClass} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}

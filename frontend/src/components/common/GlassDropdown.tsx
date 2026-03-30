import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';

interface GlassDropdownProps {
  children: React.ReactNode;
  className?: string;
}

const GlassDropdown = forwardRef<HTMLDivElement, GlassDropdownProps>(
  ({ children, className = '' }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-dropdown ${className}`}
    >
      {children}
    </motion.div>
  )
);

GlassDropdown.displayName = 'GlassDropdown';

export default GlassDropdown;

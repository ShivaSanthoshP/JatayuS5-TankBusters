import React from 'react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { spring } from '../../lib/motion';

interface GlassTabProps {
  to: string;
  icon: LucideIcon;
  label: string;
  layoutId?: string;
  onClick?: () => void;
  hideIcon?: boolean;
}

const GlassTab: React.FC<GlassTabProps> = ({
  to,
  icon: Icon,
  label,
  layoutId = 'activeNavPill',
  onClick,
  hideIcon = false,
}) => {
  return (
    <NavLink to={to} onClick={onClick} end={to === '/'}>
      {({ isActive }) => (
        <div className={`glass-nav-tab press-tactile ${isActive ? 'glass-nav-tab-active' : ''}`}>
          {isActive && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 glass-nav-tab-indicator"
              transition={spring.snappy}
            />
          )}
          {!hideIcon && <Icon size={15} className="shrink-0 relative z-[1]" />}
          <span className="relative z-[1]">{label}</span>
        </div>
      )}
    </NavLink>
  );
};

export default GlassTab;

import React from 'react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

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
        <div className={`glass-nav-tab ${isActive ? 'glass-nav-tab-active' : ''}`}>
          {isActive && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 glass-nav-tab-indicator"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
            />
          )}
          {!hideIcon && <Icon size={16} className="shrink-0 relative z-[1]" />}
          <span className="relative z-[1]">{label}</span>
        </div>
      )}
    </NavLink>
  );
};

export default GlassTab;

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
  fullWidth?: boolean;
  /** Lift this tab out of the plain row — accent-tinted, ringed (used for Argus). */
  pop?: boolean;
}

const GlassTab: React.FC<GlassTabProps> = ({
  to,
  icon: Icon,
  label,
  layoutId = 'activeNavPill',
  onClick,
  hideIcon = false,
  fullWidth = false,
  pop = false,
}) => {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      end={to === '/'}
      className={[
        fullWidth ? 'block w-full' : '',
        // Argus (pop) gets a touch of extra breathing room to its right so
        // it reads as the headline CTA, not just another tab.
        pop && !fullWidth ? 'mr-4' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
      {({ isActive }) => (
        <div className={`glass-nav-tab press-tactile ${fullWidth ? '!flex !w-full !justify-start !py-2.5 !text-[14px]' : ''} ${
          isActive ? 'glass-nav-tab-active' : pop ? 'glass-nav-tab-pop' : ''
        }`}>
          {pop && !isActive && <span aria-hidden className="argus-tab-halo" />}
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

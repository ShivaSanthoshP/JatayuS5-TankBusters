import React from 'react';

interface GlassNavbarProps {
  children: React.ReactNode;
  className?: string;
}

const GlassNavbar: React.FC<GlassNavbarProps> = ({ children, className = '' }) => {
  return (
    <div className="fixed top-0 inset-x-0 z-50 px-4 pt-5 pb-2 w-full flex justify-center pointer-events-none">
      <header
        className={`glass-navbar-pill w-full max-w-[1600px] h-[64px] flex items-center justify-between px-6 pointer-events-auto ${className}`}
      >
        {children}
      </header>
    </div>
  );
};

export default GlassNavbar;

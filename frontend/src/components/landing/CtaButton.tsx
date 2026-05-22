import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * The landing page's primary call-to-action — a blue pill with a soft top
 * "glint" that widens slightly on hover. Used in the nav, hero, and final CTA.
 */
export default function CtaButton({
  label = 'Enter app',
  to = '/dashboard',
  size = 'md',
  className = '',
}: {
  label?: string;
  to?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sized =
    size === 'sm' ? 'min-h-[44px] px-5 text-[14px]'
    : size === 'lg' ? 'min-h-[54px] px-7 text-[16px]'
    : 'min-h-[48px] px-6 text-[15px]';

  return (
    <Link
      to={to}
      className={`group relative inline-flex items-center justify-center gap-1.5 overflow-hidden
        rounded-full bg-[var(--lp-blue)] font-medium text-white whitespace-nowrap
        outline outline-1 -outline-offset-1 outline-[var(--lp-blue)]
        shadow-[inset_0_-4px_8px_rgba(255,255,255,0.20),0_10px_24px_-12px_rgba(8,113,231,0.65)]
        transition-[transform,background-color] duration-200
        hover:bg-[var(--lp-blue-deep)] active:translate-y-px ${sized} ${className}`}
    >
      {/* top glint */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[10%] top-px h-4 w-[80%] rounded-[12px]
          bg-gradient-to-b from-[var(--lp-blue-glint)] to-transparent opacity-70
          transition-transform duration-300 group-hover:scale-x-105"
      />
      <span className="relative">{label}</span>
      <ArrowRight
        size={size === 'lg' ? 17 : 15}
        className="relative transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

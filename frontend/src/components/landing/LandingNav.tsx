import CtaButton from './CtaButton';

/**
 * Floating pill nav — wordmark left, single "Enter app" CTA right.
 * No tab links: the landing page has exactly one destination.
 */
export default function LandingNav() {
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div className="fixed inset-x-0 top-4 sm:top-6 z-50 flex justify-center px-3 pointer-events-none">
      <nav
        className="pointer-events-auto flex w-[95%] max-w-5xl items-center justify-between gap-4
          rounded-full border border-[var(--lp-line)] bg-[var(--lp-surface)]/75 py-2 pl-5 pr-2
          backdrop-blur-xl shadow-[0_10px_34px_-16px_rgba(20,22,18,0.28)]"
      >
        <button
          type="button"
          onClick={toTop}
          aria-label="ITOps — back to top"
          className="flex min-h-[40px] items-center gap-2 rounded-full"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--lp-blue)]" />
          <span className="font-display text-[26px] leading-none tracking-tight text-[var(--lp-ink)]">
            ITOps
          </span>
        </button>

        <CtaButton size="sm" />
      </nav>
    </div>
  );
}

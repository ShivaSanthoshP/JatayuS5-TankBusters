import { useEffect, useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, AlertTriangle, Boxes, BookOpen, Activity, Workflow, Cpu, SlidersHorizontal, Wand2,
  type LucideIcon,
} from 'lucide-react';
import GlassNavbar from './common/GlassNavbar';
import GlassTab from './common/GlassTab';
import PageTransition from './common/PageTransition';
import ParticleBackground from './ui/ParticleBackground';
import CopilotLauncher from './CopilotLauncher';
import GlobalRunbookForm from './runbooks/GlobalRunbookForm';

const NAV: { to: string; icon: LucideIcon; label: string; pop?: boolean }[] = [
  // Argus sits leftmost and is "popped" — the accent CTA of the nav.
  { to: '/copilot', icon: Wand2, label: 'Argus', pop: true },
  { to: '/app', icon: LayoutDashboard, label: 'DASHBOARD' },
  { to: '/fleet', icon: Boxes, label: 'FLEET' },
  { to: '/sources', icon: Activity, label: 'SOURCES' },
  { to: '/workflow', icon: Workflow, label: 'WORKFLOW' },
  { to: '/incidents', icon: AlertTriangle, label: 'INCIDENTS' },
  { to: '/runbooks', icon: BookOpen, label: 'RUNBOOKS' },
  { to: '/simulation', icon: Cpu, label: 'SIMULATION' },
  { to: '/controls', icon: SlidersHorizontal, label: 'CONTROLS' },
];

export default function Layout() {
  const location = useLocation();
  // The Copilot route is a full-bleed, ChatGPT-style page: it fills the
  // viewport and scrolls under the floating navbar, so it skips the normal
  // padded max-width container.
  const isCopilot = location.pathname === '/copilot';
  // The Dashboard has its own Copilot promo card, so the floating launcher
  // is suppressed there to avoid a duplicate call-to-action.
  const isDashboard = location.pathname === '/app';
  const mainRef = useRef<HTMLElement>(null);
  const [condense, setCondense] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Drive the navbar shrink based on scroll within the main pane.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const c = Math.min(1, main.scrollTop / 80);
        setCondense(c);
      });
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Reset scroll on route change + close mobile drawer
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* Apple-Tahoe liquid-glass displacement filter — mounted once for
          every glassy pill on the page (currently: the Argus nav tab). */}
      <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden>
        <filter id="liquid-glass-nav" primitiveUnits="objectBoundingBox">
          <feImage
            result="map"
            width="100%"
            height="100%"
            x="0"
            y="0"
            href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><radialGradient id='g' cx='.5' cy='.5' r='.6'><stop offset='0' stop-color='%23808080'/><stop offset='1' stop-color='%23ffffff'/></radialGradient><rect width='1' height='1' fill='url(%23g)'/></svg>"
            preserveAspectRatio="none"
          />
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
          <feDisplacementMap in="blur" in2="map" scale="0.35" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <ParticleBackground />

      <GlassNavbar condense={condense} className="liquid-glass">
        {/* Left Branding — clickable on tablets/small laptops to toggle menu.
            The desktop tab strip only appears at xl+ (1280 px) because nine
            tabs plus the brand block can't fit any narrower without crowding
            or clipping. Below xl, this button opens the slide-down drawer. */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="xl:hidden flex items-center gap-2 sm:gap-3 shrink-0 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden flex items-center justify-center gpu shrink-0"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 6px 16px -8px rgba(21,25,26,0.22)',
            }}
          >
            <img src="/virtusa-logo.jpg" alt="Virtusa" className="block w-full h-full object-cover" />
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-display font-semibold text-[15px] sm:text-[17px] text-[var(--color-ink)] leading-tight whitespace-nowrap">
              Dynamic <span className="text-[var(--color-accent)] italic">IT</span>
            </span>
            <span className="font-display font-semibold text-[15px] sm:text-[17px] text-[var(--color-ink)] leading-tight whitespace-nowrap">
              Operations Orchestrator
            </span>
          </div>
        </button>

        {/* Desktop branding — non-clickable.
            At xl (1280–1535 px) the brand collapses to the logo only so
            the nine-tab strip plus the wordmark don't fight for the same
            1208 px of usable navbar interior. The full wordmark returns
            at 2xl (≥ 1536 px) where there's room for both. */}
        <div className="hidden xl:flex items-center gap-2 2xl:gap-3 shrink-0 min-w-0">
          <div
            className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center gpu shrink-0"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 6px 16px -8px rgba(21,25,26,0.22)',
            }}
          >
            <img src="/virtusa-logo.jpg" alt="Virtusa" className="block w-full h-full object-cover" />
          </div>
          <div className="hidden 2xl:flex flex-col leading-tight min-w-0">
            <span className="font-display font-semibold text-[17px] text-[var(--color-ink)] leading-tight whitespace-nowrap">
              Dynamic <span className="text-[var(--color-accent)] italic">IT</span>
            </span>
            <span className="font-display font-semibold text-[17px] text-[var(--color-ink)] leading-tight whitespace-nowrap">
              Operations Orchestrator
            </span>
          </div>
        </div>

        {/* Desktop nav tabs (visible xl+). gap-2 (8 px) so every pill reads
            as its own destination — anything tighter and the row collapses
            into a single slab. Combined with the per-pill hover background
            this gives a clear pointer-target for each item. */}
        <nav className="hidden xl:flex items-center gap-2 mx-auto">
          {NAV.map((item) => (
            <GlassTab
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              pop={item.pop}
            />
          ))}
        </nav>

      </GlassNavbar>

      {/* ── Mobile slide-down menu ─────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="m-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="xl:hidden fixed inset-0 z-40 bg-[rgba(21,25,26,0.18)] backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              key="m-sheet"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="xl:hidden fixed top-[80px] inset-x-3 z-50 glass-mica p-3"
            >
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <GlassTab
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    pop={item.pop}
                    layoutId="activeNavPillMobile"
                    onClick={() => setMobileOpen(false)}
                    fullWidth
                  />
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main
        ref={mainRef}
        className={isCopilot
          ? 'flex-1 overflow-hidden w-full'
          : 'flex-1 overflow-y-auto pt-[80px] sm:pt-[100px] w-full'}
      >
        {isCopilot ? (
          <Outlet />
        ) : (
          <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
            <AnimatePresence mode="wait">
              <PageTransition routeKey={location.pathname}>
                <Outlet />
              </PageTransition>
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Floating chat-launcher — every page except Copilot itself and the
          Dashboard (which carries its own Copilot promo card) */}
      {!isCopilot && !isDashboard && <CopilotLauncher hidden={mobileOpen} />}

      {/* One runbook form for the whole app — opened from the Runbooks page or
          from an Argus chat draft. */}
      <GlobalRunbookForm />
    </div>
  );
}

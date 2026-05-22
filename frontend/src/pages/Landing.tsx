import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, Mail, Globe } from 'lucide-react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4';

const FADE_MS = 500;
const FADE_OUT_LEAD = 0.55; // seconds before end to start fading out

export default function Landing() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef(0);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const cancel = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    // Fade opacity to `to`, resuming from the current value; cancels any
    // running animation so fades never compete.
    const fade = (to: number) => {
      cancel();
      const from = Number(v.style.opacity || '0');
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / FADE_MS);
        v.style.opacity = String(from + (to - from) * t);
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else rafRef.current = 0;
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      fadingOutRef.current = false;
      v.play().catch(() => {});
      fade(1);
    };

    const onTimeUpdate = () => {
      if (!fadingOutRef.current && v.duration && v.duration - v.currentTime <= FADE_OUT_LEAD) {
        fadingOutRef.current = true;
        fade(0);
      }
    };

    const onEnded = () => {
      v.style.opacity = '0';
      cancel();
      window.setTimeout(() => {
        v.currentTime = 0;
        start();
      }, 100);
    };

    v.style.opacity = '0';
    v.addEventListener('loadeddata', start);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('ended', onEnded);
    if (v.readyState >= 2) start();

    return () => {
      cancel();
      v.removeEventListener('loadeddata', start);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('ended', onEnded);
    };
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Background video — JS-driven seamless fade loop, shifted down 17% */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full translate-y-[17%] object-cover"
        style={{ opacity: 0 }}
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Nav — logo + single Launch app button (no tab links) */}
        <nav className="relative z-20 px-6 py-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between rounded-full px-6 py-3">
            <div className="flex items-center gap-2">
              <Activity size={24} className="text-white" />
              <span className="text-lg font-semibold text-white">ITOps</span>
            </div>
            <Link
              to="/dashboard"
              className="cine-glass rounded-full px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              Launch app
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <div className="relative z-10 flex flex-1 -translate-y-[20%] flex-col items-center justify-center px-6 py-12 text-center">
          <h1
            className="mb-8 whitespace-nowrap text-5xl tracking-tight text-white md:text-6xl lg:text-7xl"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Ops that never sleeps
          </h1>

          <div className="w-full max-w-xl space-y-4">
            {/* Early-access bar */}
            <form onSubmit={onSubmit} className="cine-glass flex items-center gap-3 rounded-full py-2 pl-6 pr-2">
              <input
                type="email"
                required
                placeholder="Enter your work email"
                aria-label="Work email"
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/40"
              />
              <button
                type="submit"
                aria-label="Get early access"
                className="rounded-full bg-white p-3 text-black"
              >
                <ArrowRight size={20} />
              </button>
            </form>

            <p className="px-4 text-sm leading-relaxed text-white">
              Five autonomous agents watch your fleet, predict failures, and fix them
              before the page fires — with memory of every incident.
            </p>

            <Link
              to="/copilot"
              className="cine-glass mx-auto inline-block rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              Meet Argus
            </Link>
          </div>
        </div>

        {/* Social footer */}
        <div className="relative z-10 flex justify-center gap-4 pb-12">
          <a href="#" aria-label="Docs" className="cine-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white">
            <BookOpen size={20} />
          </a>
          <a href="#" aria-label="Live site" className="cine-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white">
            <Globe size={20} />
          </a>
          <a href="#" aria-label="Contact" className="cine-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white">
            <Mail size={20} />
          </a>
        </div>
      </div>
    </div>
  );
}

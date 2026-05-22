import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight } from 'lucide-react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4';

const FADE_MS = 500;
const FADE_OUT_LEAD = 0.55; // seconds before end to start fading out

export default function Landing() {
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
      {/* Scrim — keeps the all-white text legible over bright video frames */}
      <div aria-hidden className="absolute inset-0 z-0 bg-black/35" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Nav — full name (two lines), no links, no buttons */}
        <nav className="relative z-20 px-6 py-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between rounded-full px-6 py-3">
            <div className="flex items-center gap-2.5">
              <Activity size={24} className="shrink-0 text-white" />
              <div className="flex flex-col leading-[1.15] text-white">
                <span className="text-sm font-semibold sm:text-[15px]">Dynamic IT</span>
                <span className="text-sm font-semibold sm:text-[15px]">Operations Orchestrator</span>
              </div>
            </div>
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

          <div className="w-full max-w-xl space-y-6">
            {/* Launch app — moved here from the nav, slightly bigger */}
            <Link
              to="/dashboard"
              className="cine-glass inline-flex items-center gap-2 rounded-full px-10 py-4 text-base font-medium text-white transition-colors hover:bg-white/5"
            >
              Launch app
              <ArrowRight size={18} />
            </Link>

            <p className="px-4 text-sm leading-relaxed text-white">
              Five autonomous agents watch your fleet, predict failures, and fix them
              before the page fires — with memory of every incident.
            </p>

            <Link
              to="/copilot"
              className="cine-glass inline-block rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              Meet Argus
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';

const EASE = [0.16, 1, 0.3, 1] as const;
const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_054418_a6d194f0-ac86-4df9-abe5-ded73e596d7c.mp4';

/* ── TypingMessages ─────────────────────────────────────────────
   Cycles through messages on the phone screen: type → hold → backspace
   → next, looping. */
const MESSAGES = ['Are you here?', 'Yes, I am.', 'Speak soon.'];
const TYPE_MS = 100;
const DELETE_MS = 50;
const HOLD_MS = 2000;

function TypingMessages() {
  const reduce = useReducedMotion();
  const [msgIdx, setMsgIdx] = useState(0);
  const [text, setText] = useState(reduce ? MESSAGES[0] : '');
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing');

  useEffect(() => {
    if (reduce) return;
    const full = MESSAGES[msgIdx];
    let t: number;
    if (phase === 'typing') {
      if (text.length < full.length) t = window.setTimeout(() => setText(full.slice(0, text.length + 1)), TYPE_MS);
      else t = window.setTimeout(() => setPhase('holding'), 0);
    } else if (phase === 'holding') {
      t = window.setTimeout(() => setPhase('deleting'), HOLD_MS);
    } else if (text.length > 0) {
      t = window.setTimeout(() => setText(full.slice(0, text.length - 1)), DELETE_MS);
    } else {
      t = window.setTimeout(() => { setMsgIdx((i) => (i + 1) % MESSAGES.length); setPhase('typing'); }, 0);
    }
    return () => clearTimeout(t);
  }, [text, phase, msgIdx, reduce]);

  return (
    <div className="absolute left-[48.5%] md:left-[47.5%] lg:left-[48.5%] -translate-x-1/2 bottom-[32%] z-30 w-[110px] sm:w-[130px] flex justify-start text-left pointer-events-none">
      <span className="font-nokia text-[#2A3616] text-[10px] sm:text-[14px] leading-tight break-words min-h-[1.5em]">
        {text}
        <motion.span
          className="inline-block w-1.5 h-3 bg-[#2A3616] ml-1 align-middle"
          animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 0] }}
          transition={reduce ? undefined : { duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      </span>
    </div>
  );
}

/* ── Navbar ─────────────────────────────────────────────────────── */
const LINKS = ['Philosophy', 'Trust', 'Access', 'Tribe'];

function Navbar() {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 pointer-events-none">
      <nav className="pointer-events-auto flex items-center justify-between rounded-full border border-black/10 bg-white/10 backdrop-blur-xl pl-6 pr-2 py-2">
        <span className="font-instrument text-[28px] tracking-tight text-[#1a1a1a] leading-none">dot.</span>

        <div className="hidden md:flex items-center gap-10">
          {LINKS.map((l) => (
            <a key={l} href="#" className="font-sans text-[14px] text-[#1a1a1a] transition-opacity duration-200 hover:opacity-50">
              {l}
            </a>
          ))}
        </div>

        <Link
          to="/dashboard"
          className="group relative inline-flex items-center overflow-hidden rounded-full bg-[#0871E7] px-5 py-2.5 font-sans text-[14px] text-white outline-1 outline-[#0871E7] -outline-offset-1 shadow-[inset_0_-4px_4px_rgba(255,255,255,0.39)]"
        >
          <span className="absolute left-[10%] top-[1px] w-[80%] h-4 rounded-[12px] bg-gradient-to-b from-[#DEF0FC] to-transparent transition-transform duration-300 group-hover:scale-x-105" />
          <span className="relative">Link up</span>
        </Link>
      </nav>
    </div>
  );
}

/* ── Hero ───────────────────────────────────────────────────────── */
function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F3F4ED] pt-24 md:pt-32 flex flex-col items-center">
      <video
        className="absolute inset-0 z-0 w-full h-full object-cover"
        src={VIDEO_SRC}
        autoPlay={!reduce}
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div aria-hidden className="absolute inset-0 bg-white/5" />

      <TypingMessages />

      <div className="relative z-20 pointer-events-none text-center px-5">
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: EASE }}
          className="font-instrument text-[38px] md:text-[56px] lg:text-[72px] leading-[0.85] tracking-tight text-[#1a1a1a] mb-6"
        >
          Short notes. <br /> Daily calm.
        </motion.div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
          className="font-sans text-[16px] md:text-[18px] text-[#1a1a1a]/70 leading-relaxed font-normal max-w-xl mx-auto"
        >
          Linked with a single anonymous peer. One message every day. A quiet rhythm in the digital noise.
        </motion.div>
      </div>
    </section>
  );
}

/* ── App (the landing) ──────────────────────────────────────────── */
export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <Navbar />
      <Hero />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Types ITOps agent status lines one at a time on the phone screen inside the
 * hero video: type a line → hold → backspace → type the next → loop.
 * (The five agents, condensed to fit a phone LCD.)
 */
const MESSAGES = ['Anomaly found', 'Diagnosing', 'Remediating', 'Resolved'];
const TYPE_MS = 100;
const DELETE_MS = 50;
const HOLD_MS = 2000;

export default function TypingMessages() {
  const reduce = useReducedMotion();
  const [msgIdx, setMsgIdx] = useState(0);
  const [text, setText] = useState(reduce ? 'Resolved' : '');
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing');

  useEffect(() => {
    if (reduce) return; // render a static line, no animation
    const full = MESSAGES[msgIdx];
    let t: number;
    if (phase === 'typing') {
      if (text.length < full.length) {
        t = window.setTimeout(() => setText(full.slice(0, text.length + 1)), TYPE_MS);
      } else {
        t = window.setTimeout(() => setPhase('holding'), 0);
      }
    } else if (phase === 'holding') {
      t = window.setTimeout(() => setPhase('deleting'), HOLD_MS);
    } else {
      if (text.length > 0) {
        t = window.setTimeout(() => setText(full.slice(0, text.length - 1)), DELETE_MS);
      } else {
        t = window.setTimeout(() => {
          setMsgIdx((i) => (i + 1) % MESSAGES.length);
          setPhase('typing');
        }, 0);
      }
    }
    return () => clearTimeout(t);
  }, [text, phase, msgIdx, reduce]);

  return (
    <div
      className="pointer-events-none absolute bottom-[32%] left-[48.5%] z-30 flex w-[110px] -translate-x-1/2 justify-start text-left sm:w-[130px] md:left-[47.5%] lg:left-[48.5%]"
      aria-hidden
    >
      <span className="min-h-[1.5em] break-words font-nokia text-[10px] leading-tight text-[var(--lp-phone-ink)] sm:text-[14px]">
        {text}
        <motion.span
          className="ml-1 inline-block h-3 w-1.5 align-middle bg-[var(--lp-phone-ink)]"
          animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 0] }}
          transition={reduce ? undefined : { duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      </span>
    </div>
  );
}

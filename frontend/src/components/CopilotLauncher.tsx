import { motion } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { spring } from '../lib/motion';

interface CopilotLauncherProps {
  /** Hide the launcher (e.g. while the mobile drawer is open). */
  hidden?: boolean;
}

/**
 * Floating "Ask Argus" pill, pinned bottom-right. Modern chat-launcher style:
 * always within reach on every page, routes to the full-page Argus chat.
 * Layout decides whether to mount it (skipped on /copilot itself).
 */
export default function CopilotLauncher({ hidden = false }: CopilotLauncherProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={hidden
        ? { opacity: 0, scale: 0.8, y: 12, pointerEvents: 'none' }
        : { opacity: 1, scale: 1, y: 0, pointerEvents: 'auto' }}
      transition={spring.smooth}
      className="fixed z-40 bottom-5 right-5 sm:bottom-6 sm:right-6 inline-flex items-center"
    >
      <span aria-hidden className="argus-aura-halo" />
      <span aria-hidden className="argus-aura-ping" />
      <span aria-hidden className="argus-aura-ping argus-aura-ping--delayed" />
      <motion.button
        type="button"
        aria-label="Ask Argus"
        onClick={() => navigate('/copilot')}
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="argus-neon press-tactile relative inline-flex items-center gap-2
          rounded-full pl-3.5 pr-4 py-2.5
          font-display text-[13px] text-[var(--color-surface)]"
        style={{
          background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 28px -8px var(--color-accent-glow), 0 2px 8px -2px rgba(0,0,0,0.25)',
        }}
      >
        <Wand2 size={16} className="shrink-0" />
        <span className="whitespace-nowrap">Ask Argus</span>
      </motion.button>
    </motion.div>
  );
}

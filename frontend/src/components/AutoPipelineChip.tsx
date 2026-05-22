import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { spring } from '../lib/motion';

/**
 * Compact, clickable auto-pipeline status indicator for the Dashboard header.
 * Shows whether automatic execution is on and routes to the Pipeline page,
 * where the setting is changed.
 */
export default function AutoPipelineChip({ enabled }: { enabled: boolean }) {
  return (
    <Link
      to="/pipeline"
      aria-label={`Automatic pipeline execution is ${enabled ? 'on' : 'off'}. Click to change it on the Pipeline page.`}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={spring.smooth}
        className="press-tactile flex items-center gap-2.5 rounded-xl px-3 py-1.5 cursor-pointer
          glass-sm ring-1 ring-hairline-strong/50 hover:bg-canvas-soft"
      >
        <Zap size={15} className={enabled ? 'text-accent' : 'text-ink-faint'} />
        <span className="flex flex-col leading-tight">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
            <span>Auto-pipeline</span>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: enabled ? 'var(--color-success)' : 'var(--color-ink-faint)' }}
            />
            <span className={enabled ? 'text-success' : 'text-ink-mute'}>
              {enabled ? 'On' : 'Off'}
            </span>
          </span>
          <span className="text-[10px] text-ink-faint">click to change</span>
        </span>
      </motion.div>
    </Link>
  );
}

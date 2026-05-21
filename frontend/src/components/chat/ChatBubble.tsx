import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import ChatPanel from './ChatPanel';

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-accent text-[var(--color-surface)] shadow-lg ring-1 ring-white/10 hover:scale-105 transition-transform flex items-center justify-center"
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X size={20} /> : <MessageCircle size={22} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-5 z-[59] w-[420px] max-w-[calc(100vw-2.5rem)] h-[620px] max-h-[calc(100vh-7rem)]"
          >
            <ChatPanel onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

import { motion } from 'framer-motion';

export default function Loader({ text = 'Loading' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <motion.div
        className="w-8 h-8 rounded-full"
        style={{
          border: '1.5px solid rgba(21,25,26,0.08)',
          borderTopColor: 'var(--color-accent)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
      />
      <span className="label-eyebrow !text-[10px]">{text}</span>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  ariaLabel?: string;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  value, onChange, options, ariaLabel, className = '',
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const node = itemRefs.current[value];
    const container = containerRef.current;
    if (!node || !container) return;
    const containerBox = container.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    setThumb({
      left: nodeBox.left - containerBox.left,
      width: nodeBox.width,
    });
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`segmented relative ${className}`}
    >
      {thumb && (
        <motion.div
          className="segmented-thumb"
          initial={false}
          animate={{ left: thumb.left, width: thumb.width }}
          transition={spring.snappy}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={(el) => { itemRefs.current[opt.value] = el; }}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`segmented-item ${value === opt.value ? 'segmented-item-active' : ''}`}
          type="button"
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, ariaLabel, disabled }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      data-on={checked}
      className="toggle press-tactile"
      type="button"
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <motion.span
        className="toggle-thumb gpu"
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={spring.snappy}
      />
    </button>
  );
}

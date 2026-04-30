import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { pageTransition } from '../../lib/motion';

interface Props {
  children: ReactNode;
  routeKey: string;
}

/** Wraps a route's content with a smooth springy transition. */
export default function PageTransition({ children, routeKey }: Props) {
  return (
    <motion.div
      key={routeKey}
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="gpu"
    >
      {children}
    </motion.div>
  );
}

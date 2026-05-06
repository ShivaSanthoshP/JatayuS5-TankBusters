import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into document.body so they escape ancestor stacking
 * contexts. Required for modals because the page-transition wrapper applies
 * a `filter` / `transform`, which scopes `position: fixed` to that ancestor
 * instead of the viewport — clipping any modal to the page region.
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

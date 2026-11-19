import { useEffect, useState, type RefCallback } from 'react';

export type RevealState = 'idle' | 'waiting' | 'shown';

/**
 * Reveals a box once, when it scrolls into view. Put the returned state on
 * the box as `data-reveal` and `.reveal-item` (with `--n`) on its children;
 * the CSS is in index.css.
 *
 * - 'idle': the prerendered page and a box already on screen at load. Nothing
 *   hides, so content that was painted never disappears.
 * - 'waiting': the box was below the screen at load; its items are hidden.
 * - 'shown': the box came into view; its items rise in.
 */
export function useReveal<T extends Element = Element>(): [RefCallback<T>, RevealState] {
  const [node, setNode] = useState<T | null>(null);
  const [state, setState] = useState<RevealState>('idle');

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (node.getBoundingClientRect().top < window.innerHeight) return;

    setState('waiting');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('shown');
          observer.disconnect();
        }
      },
      // Start when the box is 10% inside the screen, so the motion is seen.
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, state];
}

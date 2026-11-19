import { useEffect, useState, type RefCallback } from 'react';

export type UseInViewOptions = {
  /** The scroll container. Default: the viewport. */
  root?: Element | Document | null;
  /** Margin around the root. Default: '100px', so the loop starts a little before the card shows. */
  rootMargin?: string;
  /** Visible ratio that counts as "in view". Default: 0. */
  threshold?: number;
};

/**
 * Tells if an element is near or in the viewport.
 * Returns a callback ref for the element and the in-view state.
 * Safe for SSR: it reads no browser API during render, and the first value is false.
 * If IntersectionObserver is not available, the value stays false (the still frame shows).
 */
export function useInView<T extends Element = Element>(
  options: UseInViewOptions = {},
): [RefCallback<T>, boolean] {
  const { root = null, rootMargin = '100px', threshold = 0 } = options;
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.isIntersecting);
      },
      { root, rootMargin, threshold },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      setInView(false);
    };
  }, [node, root, rootMargin, threshold]);

  return [setNode, inView];
}

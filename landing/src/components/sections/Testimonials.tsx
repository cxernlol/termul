import { useEffect, useRef, useState } from 'react';

import { TESTIMONIALS_SNAPSHOT, initials, type HomeTestimonial } from '@/data/testimonials';
import { fetchApprovedTestimonials } from '@/lib/testimonials-api';
import { cn } from '@/lib/utils';
import { Container } from './Container';

/** The build snapshot first, then the live approved list after hydration. On error, keep the snapshot. */
function useHomeTestimonials(): HomeTestimonial[] {
  const [items, setItems] = useState(TESTIMONIALS_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;
    fetchApprovedTestimonials()
      .then((list) => {
        if (cancelled || list.length === 0) return;
        // Use the small build-time avatar for quotes the snapshot already has.
        const small = new Map(TESTIMONIALS_SNAPSHOT.map((item) => [item.id, item.avatarUrl]));
        setItems(list.map((item) => ({ ...item, avatarUrl: small.get(item.id) ?? item.avatarUrl })));
      })
      .catch(() => {
        // Keep the snapshot.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return items;
}

export function Testimonials() {
  const items = useHomeTestimonials();
  const rowRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  // Phone row: the dot follows the card nearest to the left edge.
  const onScroll = () => {
    const row = rowRef.current;
    const first = row?.firstElementChild as HTMLElement | null;
    if (!row || !first) return;
    const step = first.offsetWidth + 12;
    setActive(Math.min(items.length - 1, Math.round(row.scrollLeft / step)));
  };

  return (
    <section aria-labelledby="testimonials-title" className="flex flex-col gap-6 pt-[88px] md:gap-10 md:pt-40">
      <Container>
        <h2
          id="testimonials-title"
          className="text-[28px] leading-[34px] font-medium tracking-[-0.02em] text-muted-foreground md:text-[32px] md:leading-10"
        >
          Developers who run
          <br />
          <span className="text-foreground">their day in Troupe</span>
        </h2>
      </Container>
      <Container className="max-md:px-0">
        <ul
          ref={rowRef}
          onScroll={onScroll}
          // Phone: one scrolling row. From md: 3 columns that wrap, with a short last row centered.
          className="scrollbar-none flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 md:snap-none md:flex-wrap md:justify-center md:gap-4 md:overflow-visible md:px-0"
        >
          {items.map((item) => (
            <li
              key={item.id}
              // At least 220px (Paper); a longer quote makes the card, and its row, taller. Nothing is cut.
              className="flex min-h-[220px] w-[300px] shrink-0 snap-start flex-col justify-between gap-6 rounded-xl border-[0.5px] border-border bg-card p-[22px] shadow-card md:w-[calc((100%-32px)/3)] md:p-6"
            >
              <blockquote className="text-base leading-6 text-foreground">“{item.quote}”</blockquote>
              <div className="flex items-center gap-2.5">
                <Avatar name={item.name} src={item.avatarUrl} />
                <span className="flex flex-col">
                  <span className="text-sm leading-5 font-medium text-foreground">{item.name}</span>
                  <span className="text-sm leading-5 text-muted-foreground md:text-[13px] md:leading-[18px]">
                    {item.role}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Container>
      <div aria-hidden="true" className="flex justify-center gap-1.5 md:hidden">
        {items.map((item, index) => (
          <span
            key={item.id}
            className={cn(
              'h-1.5 rounded-[3px] transition-colors duration-150',
              index === active ? 'w-4 bg-foreground' : 'w-1.5 bg-[#3A3B3D]',
            )}
          />
        ))}
      </div>
    </section>
  );
}

/** The uploaded avatar; the author's initials when there is none or it fails to load. */
function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-[0.5px] border-chip-edge bg-muted text-xs leading-4 font-medium text-foreground">
      <span aria-hidden="true">{initials(name)}</span>
      {showImage ? (
        <img
          src={src}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          // Solid backing: a transparent avatar must not show the initials through it.
          className="absolute inset-0 size-full bg-muted object-cover"
        />
      ) : null}
    </span>
  );
}

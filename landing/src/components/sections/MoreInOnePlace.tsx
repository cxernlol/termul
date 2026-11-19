import type { ComponentType } from 'react';

import {
  AccountsIllustration,
  AutomationsIllustration,
  CanvasIllustration,
  SkillsIllustration,
} from '@/components/illustrations';
import { useInView } from '@/components/illustrations/use-in-view';
import { DOCS_URL } from '@/lib/links';
import { cn } from '@/lib/utils';
import { Container } from './Container';

type Card = {
  title: string;
  text: string;
  Illustration: ComponentType<{ className?: string; playing?: boolean }>;
  /** 328×260 drawings sit in a 252×200 slot with -38/-30 margins (Paper). */
  wide?: boolean;
};

const CARDS: Card[] = [
  {
    title: 'Canvas',
    text: 'A design canvas agents can draw on. Ask for a screen and watch it build.',
    Illustration: CanvasIllustration,
  },
  {
    title: 'Automations',
    text: 'Run an agent on a schedule or a trigger, step by step, in the background.',
    Illustration: AutomationsIllustration,
    wide: true,
  },
  {
    title: 'Skills and slash commands',
    text: 'Write reusable instructions once, then call them from the / menu.',
    Illustration: SkillsIllustration,
  },
  {
    title: 'Many accounts',
    text: 'Use several Claude and Codex accounts. Troupe switches at the limit.',
    Illustration: AccountsIllustration,
    wide: true,
  },
];

export function MoreInOnePlace() {
  return (
    <section aria-labelledby="more-title">
      <Container className="flex flex-col gap-6 pt-[88px] md:gap-8 md:pt-40">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2
            id="more-title"
            className="text-[28px] leading-[34px] font-medium tracking-[-0.02em] text-muted-foreground md:text-[32px] md:leading-10"
          >
            Everything around the chat, <br className="hidden md:inline" />
            <span className="text-foreground">in one place</span>
          </h2>
          <a
            href={DOCS_URL}
            className="inline-flex min-h-11 items-center self-start rounded-sm text-base leading-[22px] font-medium text-primary transition-colors duration-150 hover:text-foreground md:min-h-0 md:self-auto md:text-[15px]"
          >
            Read the docs <span aria-hidden="true">→</span>
          </a>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {CARDS.map((card) => (
            <FeatureCard key={card.title} card={card} />
          ))}
        </ul>
      </Container>
    </section>
  );
}

function FeatureCard({ card }: { card: Card }) {
  const [ref, inView] = useInView<HTMLLIElement>();
  const { Illustration } = card;

  return (
    <li
      ref={ref}
      // Phone: at least 310px (Paper), but grow: a 328×260 drawing plus 3 text lines does not fit 310px.
      className="flex min-h-[310px] flex-col justify-between gap-4 rounded-xl border-[0.5px] border-border bg-card p-6 shadow-card md:h-[380px]"
    >
      <div className="flex justify-center lg:justify-start">
        <Illustration
          playing={inView}
          className={cn('h-auto shrink-0', card.wide ? '-mx-[38px] -mt-[30px] w-[328px]' : 'w-[252px]')}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[17px] leading-6 font-medium tracking-[-0.01em] text-foreground">{card.title}</h3>
        <p className="text-sm leading-5 text-muted-foreground">{card.text}</p>
      </div>
    </li>
  );
}

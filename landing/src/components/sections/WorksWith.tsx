import type { CSSProperties } from 'react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { AGENTS, type AgentId } from '@/components/ui/agents';
import { useReveal } from '@/lib/use-reveal';
import { Container } from './Container';

const LIST: AgentId[] = ['claude-code', 'codex', 'gemini-cli', 'antigravity', 'opencode', 'cursor'];

/** Stagger index for .reveal-item: the title is 0, the agents follow. */
const order = (n: number) => ({ '--n': n }) as CSSProperties;

export function WorksWith() {
  // The title and the agents rise in, 30ms apart, when the row scrolls into view.
  const [revealRef, reveal] = useReveal<HTMLDivElement>();

  return (
    <section id="agents" aria-labelledby="works-with-title" className="scroll-mt-6">
      <Container>
        <div
          ref={revealRef}
          data-reveal={reveal}
          className="flex flex-col gap-4 border-b-[0.5px] border-border py-10 md:flex-row md:items-center md:justify-between md:py-12"
        >
          <h2
            id="works-with-title"
            className="reveal-item text-sm leading-5 font-medium text-muted-foreground md:text-[13px]"
            style={order(0)}
          >
            Works with the agents you use
          </h2>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-[18px] lg:gap-x-10">
            {LIST.map((id, index) => (
              <li key={id} className="reveal-item flex items-center gap-2" style={order(index + 1)}>
                <AgentLogo agent={id} size={20} />
                <span className="text-base leading-6 font-semibold tracking-[-0.01em] text-[#B6B7B9]">{AGENTS[id].name}</span>
              </li>
            ))}
            <li
              className="reveal-item text-sm leading-5 font-medium tracking-[-0.01em] text-muted-foreground"
              style={order(LIST.length + 1)}
            >
              + any ACP agent
            </li>
          </ul>
        </div>
      </Container>
    </section>
  );
}

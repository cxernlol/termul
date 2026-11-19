import { cn } from '@/lib/utils';
import { AGENTS, type AgentId } from './agents';

export function AgentLogo({ agent, size = 16, className }: { agent: AgentId; size?: number; className?: string }) {
  const { svg, color } = AGENTS[agent];
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full', className)}
      style={{ width: size, height: size, color }}
      // Static, trusted SVG files from this repo.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

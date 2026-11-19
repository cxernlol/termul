import { AgentLogo } from '@/components/ui/AgentLogo';
import type { AgentId } from '@/components/ui/agents';
import { ChevronRightIcon, GearIcon, PlusIcon } from '@/components/app-ui/icons';
import { McpLogo } from '@/components/app-ui/McpLogo';
import { MCP_NAMES, type McpId } from '@/components/app-ui/mcp';
import { MenuLabel, MenuRow, MenuSeparatorGroup, PopoverMenu, Switch } from '@/components/app-ui/Menu';
import { cn } from '@/lib/utils';

type Subagent = {
  agent: AgentId;
  title: string;
  chip: string;
  detail: string;
  status: 'working' | 'done';
  time: string;
};

const SUBAGENTS: Subagent[] = [
  { agent: 'claude-code', title: 'Fix legacy-sizes imports', chip: 'general-purpose', detail: 'Editing badge.tsx · 6 tools', status: 'working', time: '42s' },
  { agent: 'codex', title: 'Update typography tests', chip: 'worker · Codex', detail: 'Running bun run test · 3 tools', status: 'working', time: '18s' },
  { agent: 'claude-code', title: 'Review every page', chip: 'Explore', detail: 'Checked 14 pages · no issues', status: 'done', time: '1m' },
];

/** The live subagent card from a chat. */
export function SubagentList({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-col rounded-xl border-[0.5px] border-border bg-card shadow-card', className)}>
      {SUBAGENTS.map((item) => (
        <li key={item.title} className="flex items-center gap-3 border-b-[0.5px] border-border px-3.5 py-3 last:border-b-0">
          <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <AgentLogo agent={item.agent} size={16} />
            <span
              className={cn(
                'absolute -right-px -bottom-px size-[9px] rounded-full border-2 border-card',
                item.status === 'done' ? 'bg-success' : 'bg-warning',
              )}
            />
          </span>
          <span className="flex min-w-0 grow basis-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="text-sm leading-5 font-medium text-foreground">{item.title}</span>
              <span className="rounded-[5px] border-[0.5px] border-chip-edge px-1.5 text-[11px] leading-[18px] text-muted-foreground">
                {item.chip}
              </span>
            </span>
            <span className="text-xs leading-4 text-muted-foreground">{item.detail}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3.5 text-[13px] leading-5">
            <span className={item.status === 'done' ? 'text-success' : 'text-warning'}>
              {item.status === 'done' ? 'Done' : 'Working'}
            </span>
            <span className="w-7 text-right text-muted-foreground">{item.time}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Run this chat in" menu from the composer's checkout button. */
export function WorktreeMenu({ className }: { className?: string }) {
  return (
    <PopoverMenu className={className}>
      <MenuLabel>Run this chat in</MenuLabel>
      <MenuRow selected>
        <span className="grow basis-0">Current checkout</span>
        <span className="font-mono text-muted-foreground">dev</span>
      </MenuRow>
      <MenuRow>
        <span className="min-w-0 grow basis-0 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] whitespace-pre">
          rail-tool-strip-icons
        </span>
        <span className="font-mono text-muted-foreground">feat/v2-rail…</span>
      </MenuRow>
      <MenuRow>
        <span className="min-w-0 grow basis-0 whitespace-pre">composer-morph</span>
        <span className="font-mono text-muted-foreground">fix/morph</span>
      </MenuRow>
      <MenuSeparatorGroup className="gap-0">
        <MenuRow highlighted>
          <span className="text-muted-foreground">
            <PlusIcon />
          </span>
          <span className="grow basis-0">New worktree</span>
          <span className="text-muted-foreground">from dev</span>
          <span className="text-muted-foreground">
            <ChevronRightIcon size={12} />
          </span>
        </MenuRow>
      </MenuSeparatorGroup>
    </PopoverMenu>
  );
}

const CONNECTORS = [
  { id: 'paper', on: true },
  { id: 'supabase', on: true, highlighted: true },
  { id: 'context7', on: true },
  { id: 'github', on: false },
] as const satisfies readonly { id: McpId; on: boolean; highlighted?: boolean }[];

/** The composer's "MCP servers" menu. */
export function ConnectorsMenu({ className }: { className?: string }) {
  return (
    <PopoverMenu className={className}>
      <MenuLabel end="3 on">MCP servers</MenuLabel>
      {CONNECTORS.map((item) => (
        <MenuRow key={item.id} highlighted={'highlighted' in item && item.highlighted}>
          <McpLogo id={item.id} className={cn(!item.on && 'opacity-60')} />
          <span className={cn('grow basis-0', !item.on && 'text-muted-foreground')}>{MCP_NAMES[item.id]}</span>
          <Switch on={item.on} />
        </MenuRow>
      ))}
      <MenuRow className="pr-1">
        <McpLogo id="linear" />
        <span className="grow basis-0">Linear</span>
        <span className="flex h-6 items-center rounded-md bg-muted px-2 font-medium shadow-[0_0_0_0.5px_#38393A,0_1px_2px_#00000080]">
          Sign in
        </span>
      </MenuRow>
      <MenuSeparatorGroup>
        <MenuRow>
          <span className="text-muted-foreground">
            <GearIcon />
          </span>
          <span className="grow basis-0">Manage MCP servers</span>
        </MenuRow>
        <p className="px-2 pt-1 pb-1.5 text-muted-foreground">Changes apply to the next chat you start.</p>
      </MenuSeparatorGroup>
    </PopoverMenu>
  );
}

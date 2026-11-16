import { useState } from 'react'
import { ChangesPanel } from '@/components/chat/ChangesPanel'
import {
  STATUS_RAIL_ICON_CLASS,
  StatusChip,
  StatusChipPanelHeader,
  type StatusMarkKind,
  StatusRail,
  StatusRailSegment,
  StatusRailSlot
} from '@/components/chat/StatusChip'
import type { ChatChangedFiles } from '@/components/chat/use-chat-changed-files'
import { Bot, FileDiff, TerminalSquare } from '@/components/icons'

const CWD = '/work/troupe'

const CHANGES: ChatChangedFiles = {
  source: 'git',
  rowBase: CWD,
  totalAdded: 27,
  totalRemoved: 68,
  files: [
    { path: `${CWD}/tailwind.config.ts`, status: 'modified', added: 3, removed: 3 },
    { path: `${CWD}/src/styles/typography-legacy.ts`, status: 'renamed', added: 0, removed: 0 },
    {
      path: `${CWD}/src/renderer/components/ui/badge.tsx`,
      status: 'modified',
      added: 24,
      removed: 8
    },
    { path: `${CWD}/src/styles/old-scale.test.ts`, status: 'deleted', added: 0, removed: 57 },
    { path: `${CWD}/src/styles/legacy-sizes.ts`, status: 'modified', added: 0, removed: 0 }
  ]
}

type Kind = 'subagents' | 'background' | 'changes'

/** The rail in a chat-sized frame: click a segment to open its panel to the left. */
export function StatusRailInChat() {
  const [open, setOpen] = useState<Kind | null>(null)
  const toggle = (kind: Kind) => (next: boolean) => setOpen(next ? kind : null)
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-background">
      <div className="mx-auto max-w-3xl px-6 pt-6 text-sm text-secondary-foreground">
        The type check failed on two old imports of legacy-sizes. I sent a subagent to fix them, and
        I am checking the dev server output while it works.
      </div>
      <StatusRail shown>
        <StatusRailSlot isFirst>
          <StatusChip
            label="Subagents: 2 working, 1 queued, 2 done"
            panelTitle="Subagents"
            open={open === 'subagents'}
            onOpenChange={toggle('subagents')}
            icon={<Bot size={14} className={STATUS_RAIL_ICON_CLASS} aria-hidden="true" />}
            count={5}
            mark="spinner"
          >
            <StatusChipPanelHeader>2 working · 1 queued · 2 done</StatusChipPanelHeader>
          </StatusChip>
        </StatusRailSlot>
        <StatusRailSlot isFirst={false}>
          <StatusChip
            label="Background commands: 2 running, 1 done"
            panelTitle="Background"
            open={open === 'background'}
            onOpenChange={toggle('background')}
            icon={
              <TerminalSquare size={14} className={STATUS_RAIL_ICON_CLASS} aria-hidden="true" />
            }
            count={3}
            mark="spinner"
          >
            <StatusChipPanelHeader>2 running · 1 done</StatusChipPanelHeader>
          </StatusChip>
        </StatusRailSlot>
        <StatusRailSlot isFirst={false}>
          <StatusChip
            label={`Changes: ${CHANGES.files.length} changed files`}
            tooltip={`${CHANGES.files.length} changed files · Open list`}
            panelTitle="Changed files"
            open={open === 'changes'}
            onOpenChange={toggle('changes')}
            icon={<FileDiff size={14} className={STATUS_RAIL_ICON_CLASS} aria-hidden="true" />}
            count={CHANGES.files.length}
            mark="new"
          >
            <ChangesPanel
              changes={CHANGES}
              cwd={CWD}
              turnActive={false}
              onOpenFile={() => setOpen(null)}
              onOpenGit={() => setOpen(null)}
            />
          </StatusChip>
        </StatusRailSlot>
      </StatusRail>
    </div>
  )
}

const MARK_STATES: { name: string; count: number; mark: StatusMarkKind | null; muted?: boolean }[] =
  [
    { name: 'Running', count: 5, mark: 'spinner' },
    { name: 'Failed', count: 3, mark: 'failed' },
    { name: 'New changes', count: 4, mark: 'new' },
    { name: 'Done', count: 2, mark: null },
    { name: 'Refreshing', count: 4, mark: null, muted: true },
    { name: '99+', count: 128, mark: 'new' }
  ]

/** One segment per state, each in its own one-segment rail. */
export function StatusRailStates() {
  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {MARK_STATES.map((state) => (
        <div key={state.name} className="flex flex-col items-center gap-2">
          <div className="relative h-10 w-[72px]">
            <StatusRail shown className="right-1.5 top-1.5">
              <StatusRailSegment
                label={state.name}
                icon={<FileDiff size={14} className={STATUS_RAIL_ICON_CLASS} aria-hidden="true" />}
                count={state.count}
                countMuted={state.muted}
                mark={state.mark}
              />
            </StatusRail>
          </div>
          <span className="text-2xs text-muted-foreground">{state.name}</span>
        </div>
      ))}
    </div>
  )
}

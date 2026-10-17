import { useMemo, useRef } from 'react'
import { resolveActiveWorkingCopy, type WorkingCopy } from '@/lib/working-copy'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { useWorktreePick } from '@/stores/shell-layout-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useActiveTab } from '@/stores/workspace-store'

function sameWorkingCopy(a: WorkingCopy | null, b: WorkingCopy | null): boolean {
  if (a === b) return true
  if (!a || !b || a.state !== b.state || a.key !== b.key || a.path !== b.path) return false
  if (a.state === 'unresolved' || b.state === 'unresolved') return a.state === b.state
  return a.kind === b.kind && a.worktreeId === b.worktreeId
}

/**
 * Reactive `getActiveWorkingCopy`: the working copy the active project's
 * active tab, else the switcher pick, else the project folder resolves to.
 * Re-renders on tab, session/terminal cwd, pick or worktree-list changes, and
 * keeps the same object while those inputs resolve to the same working copy
 * (compare `state`/`key`/`kind` in effect deps, not the object).
 */
export function useActiveWorkingCopy(): WorkingCopy | null {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
  const activeTab = useActiveTab()
  const sessionCwd = useAcpStore((s) =>
    activeTab?.type === 'agent-chat' ? s.sessions[activeTab.sessionId]?.cwd : undefined
  )
  const terminalCwd = useTerminalStore((s) =>
    activeTab?.type === 'terminal'
      ? s.terminals.find((t) => t.id === activeTab.terminalId)?.cwd
      : undefined
  )
  const pickedPath = useWorktreePick(project?.id ?? '')

  const next = useMemo(
    () =>
      resolveActiveWorkingCopy({
        project,
        activeTab,
        pickedPath,
        sources: { sessionCwd: () => sessionCwd, terminalCwd: () => terminalCwd }
      }),
    [project, activeTab, pickedPath, sessionCwd, terminalCwd]
  )

  const stable = useRef<WorkingCopy | null>(next)
  if (!sameWorkingCopy(stable.current, next)) stable.current = next
  return stable.current
}

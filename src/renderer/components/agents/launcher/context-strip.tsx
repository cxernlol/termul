import type { BaseBranchInfo } from '@shared/types/worktree.types'
import { Folder, FolderGit2, FolderPlus, GitBranch } from '@/components/icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { WriteGate } from '@/components/ui/write-gate'
import { OUTSIDE_PROJECT_ROOT_REASON } from '@/lib/active-worktree'
import { cn } from '@/lib/utils'
import { worktreeLabel } from '@/lib/workspace-rows'
import type { Worktree } from '@/types/project'
import {
  CONTEXT_ROW_CLASS,
  ROW_ITEM_CLASS,
  ROW_TRIGGER_CLASS,
  STRIP_MENU_ITEM_CLASS
} from './launcher-classes'
import type { LaunchWorkspace } from './use-launch-workspace'

const NO_WORKTREES_REASON = 'No worktrees yet'

/** Why the Existing worktree item is unavailable, or `undefined` when usable. */
function existingDisabledReason(worktrees: readonly Worktree[]): string | undefined {
  if (worktrees.length === 0) return NO_WORKTREES_REASON
  if (worktrees.every((w) => w.outsideProjectRoot === true)) return OUTSIDE_PROJECT_ROOT_REASON
  return undefined
}

/**
 * Read-only workspace item of the context row: the working copy a chat uses.
 * Shared by the launcher (no worktree launches) and an empty chat.
 */
export function ContextRowWorkspace({
  isWorktree,
  label,
  title
}: {
  isWorktree: boolean
  label: string
  title: string
}): React.JSX.Element {
  const Icon = isWorktree ? FolderGit2 : Folder
  return (
    <span className={cn(ROW_ITEM_CLASS, 'shrink-0')} title={title}>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">Workspace: </span>
      {label}
    </span>
  )
}

/** Read-only branch item of the context row; `null` reads "Detached HEAD". */
export function ContextRowBranch({ branch }: { branch: string | null }): React.JSX.Element {
  return (
    <span className={ROW_ITEM_CLASS} title={branch ?? 'HEAD is not on a branch'}>
      <GitBranch className="size-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">Branch: </span>
      <span className="truncate">{branch ?? 'Detached HEAD'}</span>
    </span>
  )
}

/**
 * Context row under the composer card (CAP-2; Paper "2.2 New chat": a plain
 * left-aligned row of 24px ghost buttons, pt 6px, pl 2px, gap 2px), the same
 * row in the launcher and an empty chat (`ChatStartContextRow`). Only a git
 * project has a row: a folder that is not a git repo has no worktree or
 * branch to pick, so nothing shows under the composer. When worktree launches
 * are available (`interactive`) it carries the Workspace chip (Current
 * checkout, Existing worktree or New worktree) and, per mode, the checkout's
 * branch, the worktree picker or the base-branch picker. Otherwise it shows
 * the read-only workspace and branch.
 */
export function LauncherContextStrip({
  workspace,
  worktrees,
  baseBranch,
  setBaseBranch,
  baseBranchInfo,
  baseOptions,
  interactive,
  newWorktreeDisabledReason,
  gitBranch,
  isGitRepo,
  surface = 'launcher'
}: {
  /** Chip mode and the selected existing worktree (`useLaunchWorkspace`). */
  workspace: Pick<
    LaunchWorkspace,
    'isolationMode' | 'setIsolationMode' | 'existingWorktreeId' | 'setExistingWorktreeId'
  >
  /** The project's listed worktrees (Existing worktree picker). */
  worktrees: readonly Worktree[]
  baseBranch: string | null
  setBaseBranch: (branch: string | null) => void
  baseBranchInfo: BaseBranchInfo | null
  baseOptions: { value: string; label: string }[]
  /** Worktree launches are available: the pickers mount; else read-only text. */
  interactive: boolean
  /** When set, the "New worktree" option stays visible but disabled and this
      reason is exposed on hover and to assistive tech (write-gated server). */
  newWorktreeDisabledReason?: string
  /** Reactive project branch (the same fallback the empty chat row reads). */
  gitBranch: string | null
  /** A project that is not a git repo has no row. */
  isGitRepo: boolean
  /** Which surface hosts the row (its data hook): the launcher or an empty chat. */
  surface?: 'launcher' | 'chat-start'
}): React.JSX.Element | null {
  const { isolationMode, setIsolationMode, existingWorktreeId, setExistingWorktreeId } = workspace
  const existingReason = existingDisabledReason(worktrees)
  if (!isGitRepo) return null

  return (
    <div
      {...(surface === 'chat-start'
        ? { 'data-chat-start-context-row': 'true' }
        : { 'data-agent-launcher-context-strip': 'true' })}
      className={CONTEXT_ROW_CLASS}
    >
      {interactive ? (
        <>
          <Select
            value={isolationMode}
            onValueChange={(value) =>
              value === 'current' || value === 'existing' || value === 'worktree'
                ? setIsolationMode(value)
                : undefined
            }
          >
            <SelectTrigger aria-label="Workspace" className={ROW_TRIGGER_CLASS}>
              {isolationMode === 'current' ? (
                <Folder />
              ) : isolationMode === 'existing' ? (
                <FolderGit2 />
              ) : (
                <FolderPlus />
              )}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current" className={STRIP_MENU_ITEM_CLASS}>
                Current checkout
              </SelectItem>
              <div title={existingReason} className="flex w-full">
                <SelectItem
                  value="existing"
                  className={STRIP_MENU_ITEM_CLASS}
                  disabled={!!existingReason}
                  aria-description={existingReason}
                >
                  Existing worktree
                </SelectItem>
              </div>
              <WriteGate
                gated={!!newWorktreeDisabledReason}
                focusable={false}
                className="flex w-full"
              >
                <SelectItem
                  value="worktree"
                  className={STRIP_MENU_ITEM_CLASS}
                  disabled={!!newWorktreeDisabledReason}
                  aria-description={newWorktreeDisabledReason}
                >
                  New worktree
                </SelectItem>
              </WriteGate>
            </SelectContent>
          </Select>

          {isolationMode === 'current' && <ContextRowBranch branch={gitBranch} />}

          {isolationMode === 'existing' && (
            <Select
              value={existingWorktreeId ?? ''}
              onValueChange={(value) => setExistingWorktreeId(value)}
            >
              <SelectTrigger
                aria-label="Worktree"
                className={cn(ROW_TRIGGER_CLASS, 'min-w-0 shrink [&>span]:truncate')}
              >
                <GitBranch className="text-muted-foreground" />
                <SelectValue placeholder="Select worktree" />
              </SelectTrigger>
              <SelectContent>
                {worktrees.map((w) => (
                  <div
                    key={w.id}
                    title={w.outsideProjectRoot ? OUTSIDE_PROJECT_ROOT_REASON : w.path}
                    className="flex w-full"
                  >
                    <SelectItem
                      value={w.id}
                      className={STRIP_MENU_ITEM_CLASS}
                      disabled={w.outsideProjectRoot === true}
                      aria-description={
                        w.outsideProjectRoot ? OUTSIDE_PROJECT_ROOT_REASON : undefined
                      }
                    >
                      {worktreeLabel(w)}
                    </SelectItem>
                  </div>
                ))}
              </SelectContent>
            </Select>
          )}

          {isolationMode === 'worktree' && (
            <>
              <Select value={baseBranch ?? ''} onValueChange={(value) => setBaseBranch(value)}>
                <SelectTrigger
                  aria-label="Base branch"
                  className={cn(ROW_TRIGGER_CLASS, 'min-w-0 shrink [&>span]:truncate')}
                >
                  <GitBranch className="text-muted-foreground" />
                  <SelectValue placeholder="Base branch">
                    {baseBranch ? (
                      <>
                        <span className="font-normal text-muted-foreground">from </span>
                        {baseBranch}
                      </>
                    ) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {baseOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className={STRIP_MENU_ITEM_CLASS}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!baseBranch && baseBranchInfo?.isDetached && (
                <span className="truncate px-2 text-xs text-destructive">
                  Detached HEAD - pick a base
                </span>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <ContextRowWorkspace
            isWorktree={false}
            label="Local"
            title="Agent edits files in your project folder directly"
          />
          <ContextRowBranch branch={gitBranch} />
        </>
      )}
    </div>
  )
}

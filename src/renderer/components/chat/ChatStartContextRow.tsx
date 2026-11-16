import {
  ContextRowBranch,
  ContextRowWorkspace,
  LauncherContextStrip
} from '@/components/agents/launcher/context-strip'
import {
  CONTEXT_ROW_CLASS,
  PHONE_CONTEXT_ROW_CLASS
} from '@/components/agents/launcher/launcher-classes'
import { useChatStartPick } from '@/components/chat/new-chat/use-chat-start-pick'
import { useChatIsolationContext } from '@/hooks/use-chat-isolation-context'
import { cn } from '@/lib/utils'
import { workingCopyOf } from '@/lib/working-copy'
import { READ_ONLY_SERVER_REASON } from '@/lib/write-gate'
import type { AcpSession } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'

/** In the Composer V2 foot row: no top inset, the foot row places it. */
const FOOT_ROW_CLASS = 'pl-0 pt-0'

/**
 * The context row under the composer of an empty chat (desktop; Paper "2.2
 * New chat": "New worktree ▾ · from dev ▾"). In a git project it is the
 * launcher's interactive row: Current checkout, an existing worktree or a new
 * worktree with its base branch. Nothing moves while the user picks; the
 * first send applies the pick (`sendFromChatStart`). When the folder is not
 * resolved yet it reads the working copy and the branch. A project that is
 * not a git repo has no row, like the launcher. Composer V2 puts the row in
 * the composer's foot row (`inFootRow`); a working chat shows the read-only
 * `ComposerWorktreeLabel` there instead.
 */
export function ChatStartContextRow({
  session,
  inFootRow = false,
  phone = false
}: {
  session: Pick<AcpSession, 'id' | 'projectId' | 'cwd' | 'worktreePath' | 'worktreeBranch'>
  /** Composer V2: the row sits in the composer's foot row (no top inset). */
  inFootRow?: boolean
  /** Phone: the 40px worktree strip under the compact composer (Paper "2.6g"). */
  phone?: boolean
}): React.JSX.Element | null {
  const { projectId, cwd, worktreePath, worktreeBranch } = session
  const { isWorktree, isolationModeTitle, isolationBranch, isDetachedHead } =
    useChatIsolationContext({ projectId, worktreePath, worktreeBranch })
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const start = useChatStartPick(session)

  // A worktree chat prefers the listed worktree's branch (the reconciler keeps
  // it fresh after a checkout) over the branch recorded at launch.
  const wc = isWorktree ? workingCopyOf(cwd, project) : null
  const listedBranch =
    wc?.state === 'resolved' && wc.kind === 'worktree'
      ? project?.worktrees?.find((w) => w.id === wc.worktreeId)?.branch
      : undefined
  const branch = (isWorktree ? listedBranch : undefined) || isolationBranch

  if (!project?.isGitRepo) return null

  if (start.interactive) {
    return (
      <LauncherContextStrip
        surface="chat-start"
        workspace={start.workspace}
        worktrees={start.worktrees}
        baseBranch={start.pick.baseBranch}
        setBaseBranch={start.setBaseBranch}
        baseBranchInfo={start.baseBranchInfo}
        baseOptions={start.baseOptions}
        interactive
        newWorktreeDisabledReason={start.serverAdmitsWrites ? undefined : READ_ONLY_SERVER_REASON}
        gitBranch={project?.gitBranch ?? null}
        isGitRepo
        className={inFootRow ? FOOT_ROW_CLASS : phone ? PHONE_CONTEXT_ROW_CLASS : undefined}
      />
    )
  }

  return (
    <div
      data-chat-start-context-row="true"
      className={cn(
        CONTEXT_ROW_CLASS,
        inFootRow && FOOT_ROW_CLASS,
        phone && PHONE_CONTEXT_ROW_CLASS
      )}
    >
      <ContextRowWorkspace
        isWorktree={isWorktree}
        label={isWorktree ? 'Worktree' : 'Current checkout'}
        title={isolationModeTitle}
      />
      {(branch || isDetachedHead) && <ContextRowBranch branch={branch || null} />}
    </div>
  )
}

import { CODEX_CLI_SIGNED_OUT_MESSAGE } from '@/lib/agents/codex-cli-auth'
import { agentChatTabId, findPaneContainingTab, useWorkspaceStore } from '@/stores/workspace-store'
import { ChatStoppedNotice } from './ChatStoppedNotice'
import { ClaudeSignInAction } from './claude-account/ClaudeSignInAction'
import { openNewChat } from './new-chat/open-new-chat'

/** The pane that shows this chat's tab. */
function chatPaneId(sessionId: string): string | undefined {
  return findPaneContainingTab(useWorkspaceStore.getState().root, agentChatTabId(sessionId))?.id
}

/**
 * The composer dock of a stopped chat: its reason and one action. A Codex
 * chat that lost its CLI login signs in through the launcher (a sign-in has
 * no home in the chat); any other stopped chat resumes, retries a failed
 * resume, or starts a new empty chat.
 */
export function StoppedChatDock({
  session,
  codexSignedOut,
  activeError,
  retryResume,
  onResume
}: {
  session: { id: string; projectId: string }
  codexSignedOut: boolean
  activeError: string | null
  /** Set when the stop was a failed resume: the action retries it. */
  retryResume?: () => void
  onResume: () => void
}): React.JSX.Element {
  return (
    <ChatStoppedNotice
      reason={codexSignedOut ? CODEX_CLI_SIGNED_OUT_MESSAGE : activeError}
      actionLabel={codexSignedOut ? 'Sign in' : 'Resume chat'}
      onAction={() => {
        if (codexSignedOut) {
          const paneId = chatPaneId(session.id)
          if (paneId) useWorkspaceStore.getState().showAgentLauncher(paneId)
          return
        }
        if (retryResume) retryResume()
        else onResume()
      }}
      onNewChat={
        codexSignedOut
          ? undefined
          : () =>
              void openNewChat({
                paneId: chatPaneId(session.id),
                projectId: session.projectId,
                reason: 'stopped-chat'
              })
      }
      extraAction={codexSignedOut ? undefined : <ClaudeSignInAction sessionId={session.id} />}
    />
  )
}

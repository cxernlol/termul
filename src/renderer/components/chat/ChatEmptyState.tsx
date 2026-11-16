import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import type { SessionId } from '@/lib/acp-api'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { CHAT_START_PHONE_HERO_CLASS, ChatStartHero } from './chat-start'

interface ChatEmptyStateProps {
  sessionId: SessionId
}

/**
 * An empty chat (no messages yet): the same start screen as the agent
 * launcher. This part is the hero above the composer; AgentChatPanel puts it
 * in the top part of the start block (`ChatTimelineStage`), so the hero and
 * the composer sit where the launcher puts them.
 */
export function ChatEmptyState({ sessionId }: ChatEmptyStateProps): React.JSX.Element {
  const isMobileShell = useMobileWebShell()
  const session = useAcpStore((s) => s.sessions?.[sessionId])
  const projectName = useProjectStore((s) =>
    session?.projectId ? s.projects.find((p) => p.id === session.projectId)?.name : undefined
  )
  const quick = session?.kind === 'quick'

  return (
    <div
      className={
        isMobileShell
          ? CHAT_START_PHONE_HERO_CLASS
          : 'flex min-h-0 flex-1 flex-col items-center justify-end px-5'
      }
    >
      <ChatStartHero
        projectLabel={projectName ?? 'this folder'}
        headingLevel={2}
        isMobileShell={isMobileShell}
        quick={quick}
      />
    </div>
  )
}

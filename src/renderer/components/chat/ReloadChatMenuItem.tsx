import { RefreshCw } from '@/components/icons'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { useReloadChat } from '@/hooks/use-reload-chat'
import { cn } from '@/lib/utils'

/**
 * "Reload this chat" for any context menu that targets one Agent chat. It owns
 * the reload action, the enabled rule, and the disabled reason, so the tab
 * menu and the Side panel chat menu always behave the same.
 */
export function ReloadChatMenuItem({
  sessionId,
  iconClassName = 'h-4 w-4'
}: {
  sessionId: string
  /** Icon size: match the other items of the menu. */
  iconClassName?: string
}): React.JSX.Element {
  const { reload, disabled, reason } = useReloadChat(sessionId)
  return (
    <ContextMenuItem onSelect={reload} disabled={disabled}>
      <RefreshCw className={cn('mr-2', iconClassName)} />
      {disabled && reason ? <span title={reason}>Reload this chat</span> : 'Reload this chat'}
    </ContextMenuItem>
  )
}

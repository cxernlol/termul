import { ChevronDown, Clock, Shuffle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { useServerAdmitsRemoteWrites } from '@/hooks/use-server-admits-remote-writes'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import {
  COMPOSER_DOCK_TEXT_ACTION_CLASS,
  ComposerDock,
  ComposerDockActions,
  ComposerDockMessage,
  ComposerDockRow
} from '../composer/ComposerDock'
import {
  formatClock,
  isAtLimit,
  useCodexLimit,
  useCodexResumeStore,
  windowName
} from './use-codex-limit'

/**
 * In-chat card for a Codex chat at its Account's limit: switch to the Account
 * with the most room and continue, or wait until the window resets.
 * The near-limit warning is `CodexLimitWarning`, in the composer.
 */
export function CodexLimitNotice({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const state = useCodexLimit(sessionId)
  const openAppSettings = useSettingsModalStore((s) => s.openApp)
  const scheduledAt = useCodexResumeStore((s) => s.at[sessionId] ?? null)
  const schedule = useCodexResumeStore((s) => s.schedule)
  const cancelResume = useCodexResumeStore((s) => s.cancel)
  const canAddAccount = useServerAdmitsRemoteWrites()
  if (!state || !isAtLimit(state.limit)) return null

  const { ctx, limit, name, reset, switchTo, switchingTo: switching } = state
  const [best, ...others] = ctx.alternatives

  return (
    <ComposerDock tone="warning" role="alert" data-testid="codex-limit-notice">
      <ComposerDockRow>
        <ComposerDockMessage title={`${name} reached its ${windowName(limit)} limit.`}>
          {reset ? `${reset[0].toUpperCase()}${reset.slice(1)}.` : 'It resets soon.'}{' '}
          {best
            ? `Switch to ${best.account.name}${best.window ? ` (${Math.round(best.window.percent)}% used)` : ''} and continue?`
            : 'No other account has room left right now.'}
        </ComposerDockMessage>
      </ComposerDockRow>
      <ComposerDockRow className="pl-[17px]">
        {scheduledAt && (
          <span className="flex items-center gap-2 text-xs text-secondary-foreground">
            <Clock size={12} />
            Continues at {formatClock(scheduledAt)}
            <button
              type="button"
              onClick={() => cancelResume(sessionId)}
              className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus-ring"
            >
              Cancel
            </button>
          </span>
        )}
        {switching ? (
          <span className="flex items-center gap-2 text-xs text-secondary-foreground">
            <Spinner size={12} decorative />
            Switching to {switching} and continuing…
          </span>
        ) : best ? (
          <ComposerDockActions className="ml-0">
            {others.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className={COMPOSER_DOCK_TEXT_ACTION_CLASS}
                  >
                    Other account
                    <ChevronDown size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sideOffset={4}>
                  {others.map((option) => (
                    <DropdownMenuItem
                      key={option.account.id}
                      onSelect={() => void switchTo(option)}
                    >
                      {option.account.name}
                      {option.window ? ` · ${Math.round(option.window.percent)}% used` : ''}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button type="button" size="xs" className="px-3" onClick={() => void switchTo(best)}>
              <Shuffle />
              Switch to {best.account.name} and continue
            </Button>
          </ComposerDockActions>
        ) : scheduledAt ? null : (
          <ComposerDockActions className="ml-0">
            {canAddAccount && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => openAppSettings('provider')}
                className={COMPOSER_DOCK_TEXT_ACTION_CLASS}
              >
                Add account
              </Button>
            )}
            {limit.resetsAt !== null && (
              <Button
                type="button"
                size="xs"
                className="px-3"
                onClick={() => schedule(sessionId, (limit.resetsAt ?? 0) * 1000)}
              >
                <Clock />
                Continue when it resets
              </Button>
            )}
          </ComposerDockActions>
        )}
      </ComposerDockRow>
    </ComposerDock>
  )
}

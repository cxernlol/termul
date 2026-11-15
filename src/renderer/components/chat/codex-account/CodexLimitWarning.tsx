import { X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  COMPOSER_DOCK_TEXT_ACTION_CLASS,
  ComposerDock,
  ComposerDockActions,
  ComposerDockMessage,
  ComposerDockRow
} from '../composer/ComposerDock'
import { isNearLimit, useCodexLimit, windowName } from './use-codex-limit'

/**
 * Composer dock for a Codex chat near its Account's limit (from 80%), with the
 * offer to switch to the Account with the most room. Only a warning: the
 * composer stays usable.
 */
export function CodexLimitWarning({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const state = useCodexLimit(sessionId)
  if (!state || !isNearLimit(state.limit)) return null

  const { limit, name, reset, switchTo, dismiss } = state
  const best = state.ctx.alternatives[0]
  return (
    <ComposerDock tone="warning" role="status" data-testid="codex-limit-warning">
      <ComposerDockRow>
        <ComposerDockMessage
          title={`${name} has used ${Math.round(limit.percent ?? 80)}% of its ${windowName(limit)} limit.`}
        >
          {reset ? `${reset[0].toUpperCase()}${reset.slice(1)}.` : null}
        </ComposerDockMessage>
        <ComposerDockActions>
          {best && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => void switchTo(best)}
              className={COMPOSER_DOCK_TEXT_ACTION_CLASS}
            >
              Switch to {best.account.name}
            </Button>
          )}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground [&_svg]:size-3"
          >
            <X />
          </Button>
        </ComposerDockActions>
      </ComposerDockRow>
    </ComposerDock>
  )
}

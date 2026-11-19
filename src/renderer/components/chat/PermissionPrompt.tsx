import type { SubagentAgent } from '@shared/types/subagent'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import type { PermissionOption } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import { permissionToolTitle } from '@/lib/permission-tool-title'
import { cn } from '@/lib/utils'
import {
  type PendingPermission,
  useAcpStore,
  useAgentIcon,
  useAgentTemplateId
} from '@/stores/acp-store'
import { AgentGlyph } from './AgentGlyph'
import { askingOrchestratedSubagent } from './subagent-strip'
import {
  isAllowOption,
  isRejectOption,
  pickPrimaryAllowOption,
  pickRejectOption
} from './tool-call-format'

/**
 * Mobile only: taps this soon after a request first renders are ignored, so a
 * tap aimed at the editor (or a scroll) cannot land on Allow as the prompt
 * appears under the thumb.
 */
const APPROVAL_ACTIVATION_GUARD_MS = 400

interface PermissionPromptProps {
  permission: PendingPermission
  /** Render flush with the composer surface instead of as a standalone panel. */
  embedded?: boolean
  /**
   * False while the pane is hidden (a background tab). The 400ms tap guard
   * starts when the prompt is on screen, so it restarts when this turns true.
   */
  isVisible?: boolean
}

/**
 * The approval's asking child: its own glyph and title, when the pending
 * permission belongs to an orchestrated run of this chat. The join is
 * renderer-side — the request's `agentId` is the child host agent's.
 */
function AskingChild({ agent, title }: { agent: SubagentAgent; title: string }): React.JSX.Element {
  const templateId = useAgentTemplateId(agent.agentId, agent.configId)
  const icon = useAgentIcon(agent.agentId, agent.configId)
  return (
    <span className="inline-flex min-w-0 items-center gap-1 font-normal text-muted-foreground">
      <AgentGlyph templateId={templateId} icon={icon} size={14} />
      <span className="truncate">{title}</span>
    </span>
  )
}

/**
 * Inline approval prompt for a single pending request. It intentionally has
 * no dismiss or outside-click behavior; the agent stays paused until the user
 * chooses an option or explicitly cancels the request.
 */
export function PermissionPrompt({
  permission,
  embedded = true,
  isVisible = true
}: PermissionPromptProps): React.JSX.Element {
  const respond = useAcpStore((s) => s.respondPermission)
  const isMobileShell = useMobileWebShell()
  const asking = useAcpStore((s) =>
    askingOrchestratedSubagent(s.toolCalls?.[permission.sessionId], permission.agentId)
  )
  // When this request first became visible: set at mount and again whenever
  // the requestId changes (the prompt is not re-keyed per request) or a hidden
  // pane turns visible. A request that changes while hidden is stamped when
  // the pane shows. Monotonic clock: a wall-clock step backwards must not
  // keep the guard closed.
  const shownRef = useRef({ requestId: permission.requestId, at: performance.now() })
  useLayoutEffect(() => {
    if (!isVisible) return
    shownRef.current = { requestId: permission.requestId, at: performance.now() }
  }, [permission.requestId, isVisible])

  const choose = useCallback(
    (optionId?: string) => {
      if (isMobileShell && performance.now() - shownRef.current.at < APPROVAL_ACTIVATION_GUARD_MS) {
        void logFrontendError({
          level: 'info',
          source: 'PermissionPrompt.activationGuard',
          message: `Ignored early tap on permission request ${permission.requestId}`
        })
        return
      }
      void respond(permission.requestId, optionId).catch(() => {
        toast.error('Could not send the permission response. Try again.')
      })
    },
    [respond, permission.requestId, isMobileShell]
  )

  const { allows, others, rejects, primaryAllowId } = useMemo(() => {
    const allowOpts = permission.options.filter(isAllowOption)
    const rejectOpts = permission.options.filter(isRejectOption)
    const otherOpts = permission.options.filter((o) => !isAllowOption(o) && !isRejectOption(o))
    const primary = pickPrimaryAllowOption(allowOpts)
    return {
      allows: allowOpts,
      others: otherOpts,
      rejects: rejectOpts,
      primaryAllowId: primary?.optionId ?? null
    }
  }, [permission.options])

  const renderOption = (option: PermissionOption): React.JSX.Element => {
    const allow = isAllowOption(option)
    const reject = isRejectOption(option)
    const primary = allow && option.optionId === primaryAllowId

    return (
      <Button
        key={option.optionId}
        variant={primary ? 'default' : 'outline'}
        size={isMobileShell ? 'touch' : 'sm'}
        className={cn(
          'min-w-0 rounded-lg px-3 font-medium whitespace-nowrap transition-[scale,color,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100',
          !isMobileShell && 'h-8 text-xs',
          primary && 'shadow-2xs',
          !primary &&
            !reject &&
            'border-border/70 bg-secondary/30 text-foreground hover:bg-secondary/70 hover:text-foreground',
          reject &&
            'border-transparent text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive'
        )}
        onClick={() => choose(option.optionId)}
        title={option.name}
      >
        {allow ? (
          <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />
        ) : reject ? (
          <ShieldAlert size={14} className="shrink-0" aria-hidden="true" />
        ) : null}
        <span className="truncate">{option.name}</span>
      </Button>
    )
  }

  const rejectOnCancel = pickRejectOption(permission.options)

  return (
    <section
      aria-labelledby={`permission-title-${permission.requestId}`}
      // Mobile: drops its own live region; the shell live region that will
      // announce approvals ships with the a11y-floor goal. Until it lands, a new
      // request is not announced on mobile (this section never takes focus).
      aria-live={isMobileShell ? undefined : 'polite'}
      data-approval-prompt={`permission:${permission.requestId}`}
      className={cn(
        'px-3.5 py-3 sm:px-4',
        embedded
          ? 'rounded-t-[15px] border-b border-warning/20 bg-warning/[0.035]'
          : 'rounded-2xl border border-warning/25 bg-card shadow-sm'
      )}
      data-testid="permission-prompt"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-warning/30 bg-warning/15 text-warning">
          <ShieldAlert size={13} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={`permission-title-${permission.requestId}`}
            className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-foreground"
          >
            Approval needed
            {asking?.agent && (
              <>
                <span aria-hidden="true" className="font-normal text-muted-foreground">
                  ·
                </span>
                <AskingChild agent={asking.agent} title={asking.title} />
              </>
            )}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {asking?.agent ? (
              <>
                {asking.agent.name} sub-agent wants to run{' '}
                <code className="rounded border border-border/50 bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground break-all select-all">
                  {permissionToolTitle(permission.toolCall)}
                </code>
                {asking.workspace?.mode === 'worktree' ? ' in its worktree.' : '.'}
              </>
            ) : (
              <>
                The agent is waiting for permission to run{' '}
                <code className="rounded border border-border/50 bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground break-all select-all">
                  {permissionToolTitle(permission.toolCall)}
                </code>
                .
              </>
            )}
          </p>
        </div>
      </div>

      {permission.options.length === 0 && (
        <p className="ml-8 mt-2 text-xs leading-relaxed text-muted-foreground">
          The agent provided no choices. Cancel the request to keep this action blocked.
        </p>
      )}

      <fieldset
        className={cn('mt-2.5 flex flex-wrap items-center', isMobileShell ? 'gap-3' : 'gap-2')}
      >
        <legend className="sr-only">Permission options</legend>
        {allows.map(renderOption)}
        {others.map(renderOption)}
        {rejects.length > 0 ? (
          rejects.map(renderOption)
        ) : (
          <Button
            variant="ghost"
            size={isMobileShell ? 'touch' : 'sm'}
            className={cn(
              'rounded-lg px-2.5 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive',
              !isMobileShell && 'h-8 text-xs'
            )}
            onClick={() => choose(undefined)}
          >
            <ShieldAlert size={14} className="shrink-0" aria-hidden="true" />
            <span>Cancel request</span>
          </Button>
        )}
      </fieldset>
      {rejectOnCancel && (
        <p
          className={cn(
            'mt-2 text-2xs leading-tight',
            isMobileShell ? 'text-muted-foreground' : 'text-muted-foreground/70'
          )}
        >
          Choose an option to resume the agent. This request stays here until you respond.
        </p>
      )}
    </section>
  )
}

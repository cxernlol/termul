import { forwardRef } from 'react'
import { AgentGlyph } from '@/components/chat/AgentGlyph'
import { ModeIcon } from '@/components/chat/mode-menu'
import { ChevronDown } from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface MobileModelPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  agentTemplateId: string | null
  agentIcon: string | null
  label: string
  effort?: string
  modeId?: string
  armed: boolean
  pending: boolean
}

export const MobileModelPill = forwardRef<HTMLButtonElement, MobileModelPillProps>(
  function MobileModelPill(
    { agentTemplateId, agentIcon, label, effort, modeId, armed, pending, className, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-busy={pending || undefined}
        className={cn(
          // Composer V2 phone (Paper "2.6b"): a 36px ghost chip, 14/20 muted text,
          // 44px hit area. The name never truncates at real lengths; the
          // toolbar spacer gives way first.
          "relative inline-flex h-9 min-w-0 items-center gap-1.5 rounded-[10px] pl-1 pr-1.5 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] enabled:active:bg-foreground/[0.06] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:text-disabled-foreground",
          className
        )}
        {...props}
      >
        <AgentGlyph templateId={agentTemplateId} icon={agentIcon} size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
        {!armed && effort ? <span className="shrink-0 text-muted-foreground">{effort}</span> : null}
        {modeId ? <ModeIcon modeId={modeId} size={14} /> : null}
        {pending ? (
          <Spinner size={12} decorative className="shrink-0" />
        ) : (
          <ChevronDown size={12} aria-hidden="true" className="shrink-0" />
        )}
      </button>
    )
  }
)

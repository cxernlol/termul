/**
 * AI Prompt Dialog — template picker with one-click copy.
 *
 * Provides a dialog that:
 * - Lists AI prompt templates (Cursor, Aider, Claude Code)
 * - Shows per-template variable filling for worktree context
 * - One-click copy button
 * - Per-tool labeling ("Paste this into [Tool]")
 */

import { useCallback, useState } from 'react'
import { Bot, Check, Copy, MessageSquare, Terminal } from '@/components/icons'
import {
  PHONE_MODAL_BUTTON_CLASS,
  PHONE_MODAL_CARD_CLASS,
  PHONE_MODAL_OVERLAY_CLASS,
  TOUCH_HIT_AREA_CLASS
} from '@/components/phone-modal-classes'
import { Button } from '@/components/ui/button'
import {
  type AiPromptTemplate,
  BUILT_IN_TEMPLATES,
  buildTemplateVariables,
  interpolateTemplate
} from '@/lib/ai-prompt-templates'
import { cn } from '@/lib/utils'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'

interface AiPromptDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Worktree context for filling template variables */
  context?: {
    sourceBranch: string
    targetBranch?: string
    conflictFiles?: string[]
    worktreePath: string
    projectName: string
  }
}

const TOOL_ICONS: Record<string, typeof Bot> = {
  Cursor: MessageSquare,
  Aider: Terminal,
  'Claude Code': Bot
}

export function AiPromptDialog({ isOpen, onClose, context }: AiPromptDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<AiPromptTemplate>(BUILT_IN_TEMPLATES[0])
  const [copied, setCopied] = useState(false)
  // Mobile web shell: system back closes this dialog (inert on desktop).
  useOverlayRegistration('ai-prompt-dialog', isOpen, onClose, { mobileShellOnly: true })

  const generatedPrompt = context
    ? interpolateTemplate(
        selectedTemplate.template,
        buildTemplateVariables({
          sourceBranch: context.sourceBranch,
          targetBranch: context.targetBranch,
          conflictFiles: context.conflictFiles,
          worktreePath: context.worktreePath,
          projectName: context.projectName
        })
      )
    : ''

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = generatedPrompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [generatedPrompt])

  if (!isOpen) return null

  const _Icon = TOOL_ICONS[selectedTemplate.toolName] ?? MessageSquare

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 ${PHONE_MODAL_OVERLAY_CLASS}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-prompt-dialog-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className={`max-w-[600px] bg-popover border border-border rounded-lg shadow-2xl ${PHONE_MODAL_CARD_CLASS} sm:max-h-[80dvh]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 id="ai-prompt-dialog-title" className="text-sm font-semibold text-foreground">
            AI Conflict Resolution Prompts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`h-6 w-6 flex items-center justify-center rounded hover:bg-secondary active:bg-secondary text-muted-foreground ${TOUCH_HIT_AREA_CLASS}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Template selector */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <span className="label-group text-muted-foreground">Tool</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {BUILT_IN_TEMPLATES.map((tpl) => {
              const TplIcon = TOOL_ICONS[tpl.toolName] ?? MessageSquare
              return (
                <button
                  type="button"
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors pointer-coarse:min-h-11',
                    selectedTemplate.id === tpl.id
                      ? 'bg-primary-fill text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TplIcon size={12} />
                  {tpl.toolName}
                </button>
              )
            })}
          </div>
        </div>

        {/* Prompt preview */}
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="label-group text-muted-foreground">
              {selectedTemplate.name} — Paste this into {selectedTemplate.toolName}
            </span>
          </div>
          <pre className="whitespace-pre-wrap text-xs text-foreground bg-muted rounded-md p-3 font-mono leading-relaxed max-h-[300px] overflow-auto">
            {generatedPrompt || 'Select a worktree context to generate a prompt.'}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border shrink-0 max-sm:flex-col max-sm:items-stretch">
          <span className="text-3xs text-muted-foreground">
            Variables: {selectedTemplate.variables.join(', ')}
          </span>
          <Button
            type="button"
            size="sm"
            variant={copied ? 'ghost' : 'default'}
            onClick={handleCopy}
            disabled={!generatedPrompt}
            className={cn(
              PHONE_MODAL_BUTTON_CLASS,
              copied && 'bg-success/10 text-success hover:bg-success/15 hover:text-success'
            )}
          >
            {copied ? (
              <>
                <Check /> Copied!
              </>
            ) : (
              <>
                <Copy /> Copy Prompt
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

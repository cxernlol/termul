import { useRef } from 'react'
import { Paperclip, Plus, Wrench } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { MENU_SHORTCUT_CLASS } from '@/components/ui/menu-styles'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { logFrontendError } from '@/lib/log-api'
import { TERMUL_TOOL_ICONS } from '../ToolChip'
import type { ComposerAddHandle } from './ComposerAddSheet'
import type { TermulToolRow } from './use-termul-tools'

const LOG_SOURCE = 'composer-add-menu'
const ICON = 'mr-2 shrink-0 text-muted-foreground'

interface ComposerAddMenuProps {
  handle: ComposerAddHandle
  /** Session closed: the editor is unavailable. */
  disabled: boolean
  termulTools: TermulToolRow[]
}

/**
 * The desktop composer's `+`: attach, mention, slash commands and Troupe's
 * own tools. The connectors (MCP servers) have their own button in the
 * Composer V2 foot row (`ComposerConnectorsButton`). The phone shell uses
 * `ComposerAddSheet`, which keeps its Connectors row.
 */
export function ComposerAddMenu({
  handle,
  disabled,
  termulTools
}: ComposerAddMenuProps): React.JSX.Element {
  // What to do once the menu has closed. Radix traps focus while the menu is
  // open, so an editor insert has to wait until the close hands focus back.
  // `null` returns focus to the editor (Escape); `'keep'` leaves it alone
  // (a click outside, or a settings page that takes focus itself).
  const afterCloseRef = useRef<(() => void) | 'keep' | null>(null)

  const onAttach = (): void => {
    // The picker needs this click's user activation, so it opens now.
    Promise.resolve(handle.pickFiles()).catch((err: unknown) => {
      void logFrontendError({
        level: 'warn',
        source: LOG_SOURCE,
        message: `Attach files failed: ${err instanceof Error ? err.name : 'unknown error'}`
      })
    })
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Add to chat"
              className="relative flex size-8 items-center justify-center text-muted-foreground transition-[color,transform] ease-out after:absolute after:-inset-1.5 after:content-[''] hover:text-foreground data-[state=open]:text-foreground"
            >
              <Plus size={16} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Add files, mentions and tools</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-56"
        onInteractOutside={() => {
          afterCloseRef.current = 'keep'
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const next = afterCloseRef.current
          afterCloseRef.current = null
          if (next === 'keep') return
          if (next) next()
          else handle.focusEditor()
        }}
      >
        <DropdownMenuItem disabled={!handle.canPick} onSelect={onAttach}>
          <Paperclip size={14} aria-hidden="true" className={ICON} />
          {handle.canPickImages ? 'Add files or photos' : 'Add files'}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() => {
            afterCloseRef.current = () => handle.insertTrigger('@')
          }}
        >
          <span aria-hidden="true" className={`${ICON} w-3.5 text-center`}>
            @
          </span>
          Mention
          <DropdownMenuShortcut>@</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() => {
            afterCloseRef.current = () => handle.insertTrigger('/')
          }}
        >
          <span aria-hidden="true" className={`${ICON} w-3.5 text-center`}>
            /
          </span>
          Slash commands
          <DropdownMenuShortcut>/</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={disabled}>
            <Wrench size={14} aria-hidden="true" className={ICON} />
            Troupe tools
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <DropdownMenuLabel>Ask the agent to use</DropdownMenuLabel>
            {termulTools.map(({ tool, state }) => {
              const Icon = TERMUL_TOOL_ICONS[tool.id]
              return (
                <DropdownMenuItem
                  key={tool.id}
                  onSelect={() => {
                    afterCloseRef.current = () => handle.insertTool(tool.id)
                  }}
                >
                  <span aria-hidden="true" className={`${ICON} self-start pt-0.5`}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{tool.label}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {tool.description}
                    </span>
                  </span>
                  {state === 'closed' ? <span className={MENU_SHORTCUT_CLASS}>Closed</span> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

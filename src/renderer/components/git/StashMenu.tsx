import type { GitStashInfo } from '@shared/types/ipc.types'
import { Archive, ArchiveRestore, ClipboardPaste, Trash2 } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { QUIET_ICON_BUTTON_CLASS } from '@/components/ui/panel-styles'
import { useServerAdmitsRemoteWrites } from '@/hooks/use-server-admits-remote-writes'
import { cn } from '@/lib/utils'

interface StashMenuProps {
  stashes: GitStashInfo[]
  /** There is something to stash (Stash changes is enabled). */
  canStash: boolean
  isMutating: boolean
  onStash: () => void
  onApply: (index: number) => void
  onPop: (index: number) => void
  onDrop: (index: number) => void
}

/**
 * The Changes header stash button (Paper 3.1 has no Stashes section): one
 * menu with "Stash changes" on top, then each stash with Apply, Pop and Drop.
 * The list always opens; a read-only server or a running git action disables
 * the writes in it.
 */
export function StashMenu({
  stashes,
  canStash,
  isMutating,
  onStash,
  onApply,
  onPop,
  onDrop
}: StashMenuProps): React.JSX.Element {
  const admitted = useServerAdmitsRemoteWrites()
  const writesOff = !admitted || isMutating
  const label = stashes.length > 0 ? `Stashes (${stashes.length})` : 'Stash changes'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={!canStash && stashes.length === 0}>
        <button
          type="button"
          className={cn(
            QUIET_ICON_BUTTON_CLASS,
            'flex size-7 shrink-0 disabled:cursor-not-allowed disabled:opacity-40'
          )}
          title={label}
          aria-label={label}
        >
          <Archive size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem disabled={!canStash || writesOff} onSelect={onStash}>
          <Archive className="mr-2 size-3.5" aria-hidden="true" />
          Stash changes
        </DropdownMenuItem>
        {stashes.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Stashes</DropdownMenuLabel>
            {stashes.map((stash) => (
              <DropdownMenuSub key={stash.index}>
                <DropdownMenuSubTrigger>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono">{`stash@{${stash.index}}`}</span>
                    <span className="fade-end text-muted-foreground">{stash.message}</span>
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem disabled={writesOff} onSelect={() => onApply(stash.index)}>
                    <ClipboardPaste className="mr-2 size-3.5" aria-hidden="true" />
                    Apply
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={writesOff} onSelect={() => onPop(stash.index)}>
                    <ArchiveRestore className="mr-2 size-3.5" aria-hidden="true" />
                    Pop
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={writesOff}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={() => onDrop(stash.index)}
                  >
                    <Trash2 className="mr-2 size-3.5" aria-hidden="true" />
                    Drop
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

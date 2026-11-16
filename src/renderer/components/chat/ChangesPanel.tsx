import { useCallback, useEffect, useRef, useState } from 'react'
import { baseName } from '@/components/chat/tool-call-summary'
import { File } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDelayedFlag } from '@/hooks/use-delayed-flag'
import { useServerAdmitsRemoteWrites } from '@/hooks/use-server-admits-remote-writes'
import { isGitWriteBlocked } from '@/lib/active-working-copy'
import { GIT_STATUS_LABEL } from '@/lib/git-status-display'
import { logFrontendError } from '@/lib/log-api'
import { cn } from '@/lib/utils'
import { normalizePath } from '@/lib/working-copy'
import { selectGitDiffStat, useGitStatusStore } from '@/stores/git-status-store'
import { useProjectStore } from '@/stores/project-store'
import { type ChangedFile, type ChatChangedFiles, dirName } from './use-chat-changed-files'

/** Rows shown before "Show N more". */
const MAX_ROWS = 4
/** A first Git read must take this long before the skeleton shows. */
const SKELETON_DELAY_MS = 400

export interface ChangesPanelProps {
  changes: ChatChangedFiles
  cwd: string
  /** Session activeTurn: Discard all is disabled while true. */
  turnActive: boolean
  /** False inside the phone bottom sheet, where SheetTitle already names the panel. */
  showTitle?: boolean
  /** Row click. The caller closes the panel and opens the diff. */
  onOpenFile: (path: string) => void
  /** "Open in Git" and "Show N more". Undefined (quick chats) hides both. */
  onOpenGit?: () => void
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `fullPath` relative to the repository root, the folder the discard runs in.
 * A path relative to a subfolder would resolve against the wrong directory.
 */
function repoRelative(fullPath: string, root: string): string {
  const prefix = `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/`
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
}

function LineCounts({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  return (
    <>
      <span className="text-diff-added-foreground">+{added}</span>{' '}
      <span className="text-destructive">−{removed}</span>
    </>
  )
}

function CountLane({ file }: { file: ChangedFile }): React.JSX.Element {
  let content: React.ReactNode = null
  if (file.status === 'deleted' && file.removed > 0) {
    content = <span className="text-destructive">−{file.removed}</span>
  } else if (file.added > 0 || file.removed > 0) {
    content = <LineCounts added={file.added} removed={file.removed} />
  } else if (file.status === 'renamed') {
    content = <span className="text-connection">Renamed</span>
  }
  return <span className="w-16 shrink-0 text-right tabular-nums">{content}</span>
}

function ChangeRow({
  file,
  rowBase,
  onOpenFile
}: {
  file: ChangedFile
  rowBase: string
  onOpenFile: (path: string) => void
}): React.JSX.Element {
  const label = baseName(file.path) || file.path
  const dir = dirName(file.path, rowBase)
  const isDeleted = file.status === 'deleted'
  const accessibleName = file.status ? `${file.path}, ${GIT_STATUS_LABEL[file.status]}` : file.path
  const rowClass =
    'flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs select-none'
  const content = (
    <>
      <File size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <span
        className={cn(
          'max-w-[70%] shrink-0 truncate',
          isDeleted ? 'text-muted-foreground' : 'text-secondary-foreground'
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{dir}</span>
      <CountLane file={file} />
    </>
  )

  // A deleted file has nothing to open in the editor (openChangedFile reads the
  // file from disk), so its row is static, as in ChangedFilesList.
  if (isDeleted) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: a fieldset would give a static row form semantics
      <div
        role="group"
        title={file.path}
        aria-label={accessibleName}
        className={cn(rowClass, 'cursor-default')}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      title={file.path}
      aria-label={accessibleName}
      onClick={() => onOpenFile(file.path)}
      className={cn(
        rowClass,
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        'hover:bg-row-hover-solid',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring'
      )}
    >
      {content}
    </button>
  )
}

function SkeletonRows(): React.JSX.Element {
  const widths = ['w-24', 'w-32', 'w-20', 'w-28']
  return (
    <div aria-busy="true" aria-label="Loading changes" role="status">
      {widths.map((width) => (
        <div key={width} className="flex h-8 items-center gap-2 px-2.5" aria-hidden="true">
          <span className="size-3.5 shrink-0 rounded-sm bg-muted" />
          <span className={cn('h-2.5 rounded-sm bg-muted', width)} />
          <span className="ml-auto h-2.5 w-10 rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  )
}

function PanelFooter({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="mt-1 border-t-[0.5px] border-border px-1 pb-0.5 pt-1.5">{children}</div>
}

/**
 * The Changes popover (or sheet) body: the uncommitted files this chat
 * touched, with "Discard all" confirmed in place.
 */
export function ChangesPanel({
  changes,
  cwd,
  turnActive,
  showTitle = true,
  onOpenFile,
  onOpenGit
}: ChangesPanelProps): React.JSX.Element {
  const { files, rowBase, source } = changes
  const isGit = source === 'git'
  const fileCount = files.length

  const key = cwd ? normalizePath(cwd) : ''
  const hasStatus = useGitStatusStore((state) => state.statuses[key] !== undefined)
  const statusError = useGitStatusStore((state) => state.errors[key]?.status)
  const diffStatError = useGitStatusStore((state) => state.errors[key]?.diffStat)
  const hasDiffStat = useGitStatusStore(selectGitDiffStat(cwd)) !== null

  const admitted = useServerAdmitsRemoteWrites()
  const projects = useProjectStore((state) => state.projects)
  const writable = admitted && !isGitWriteBlocked(rowBase, projects)

  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running'>('idle')
  const [discardError, setDiscardError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const discardRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const firstRead =
    isGit &&
    fileCount === 0 &&
    statusError === undefined &&
    (!hasStatus || (!hasDiffStat && diffStatError === undefined))
  const showSkeleton = useDelayedFlag(firstRead, SKELETON_DELAY_MS)
  const [skeletonShown, setSkeletonShown] = useState(false)
  useEffect(() => {
    if (showSkeleton) setSkeletonShown(true)
  }, [showSkeleton])

  const errorMessage = discardError ?? (isGit ? statusError : undefined)

  // Esc inside the confirm cancels the confirm only. A capture listener on the
  // window runs before the popover's own Esc handling and keeps it from closing.
  useEffect(() => {
    if (phase === 'idle') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (phase === 'confirm') setPhase('idle')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [phase])

  // Focus moves to Cancel when the confirm opens, back to "Discard all" when it is cancelled.
  useEffect(() => {
    if (phase === 'confirm') {
      wasConfirming.current = true
      cancelRef.current?.focus()
    } else if (phase === 'idle' && wasConfirming.current) {
      wasConfirming.current = false
      discardRef.current?.focus()
    }
  }, [phase])

  const discardAll = useCallback(async () => {
    if (turnActive) return
    setPhase('running')
    const paths = files.map((file) => repoRelative(file.path, rowBase))
    void logFrontendError({
      level: 'info',
      message: `ChangesPanel: discarding ${paths.length} files in ${rowBase}`,
      source: 'ChangesPanel'
    })
    try {
      await useGitStatusStore.getState().discardFiles(rowBase, paths)
      if (mounted.current) setDiscardError(null)
    } catch (error) {
      void logFrontendError({
        level: 'warn',
        message: `ChangesPanel: discard failed in ${rowBase}: ${errorText(error)}`,
        source: 'ChangesPanel'
      })
      if (mounted.current) setDiscardError(errorText(error))
    } finally {
      // discardFiles refreshes the repository root; the chat reads its own folder.
      if (normalizePath(rowBase) !== key) {
        void useGitStatusStore
          .getState()
          .refreshStatus(cwd)
          .catch(() => {})
      }
      if (mounted.current) setPhase('idle')
    }
  }, [files, cwd, key, rowBase, turnActive])

  const retry = useCallback(() => {
    setDiscardError(null)
    void useGitStatusStore
      .getState()
      .refreshStatus(cwd)
      .catch(() => {})
  }, [cwd])

  const openGitButton = onOpenGit && (
    <Button type="button" variant="secondary" size="xs" className="ml-auto" onClick={onOpenGit}>
      Open in Git
    </Button>
  )

  const showRows = fileCount > 0 && errorMessage === undefined
  const showEmpty = fileCount === 0 && errorMessage === undefined && !firstRead
  const capped = onOpenGit !== undefined && fileCount > MAX_ROWS
  const visible = capped ? files.slice(0, MAX_ROWS) : files
  const canDiscard = isGit && writable

  let summary: string | null = null
  if (showRows) {
    summary = isGit
      ? `This chat · ${plural(fileCount, 'file')}, not committed`
      : `This chat · ${plural(fileCount, 'file')} edited`
  }

  const rows = visible.map((file) => (
    <ChangeRow key={file.path} file={file} rowBase={rowBase} onOpenFile={onOpenFile} />
  ))

  return (
    <div>
      {showTitle && (
        <div className="flex min-h-8 items-center gap-2 px-2.5 text-xs">
          <span className="shrink-0 font-medium text-foreground">Changes</span>
          {summary && (
            <span className="ml-auto flex min-w-0 items-baseline gap-1.5 text-muted-foreground">
              <span className="min-w-0 truncate">{summary}</span>
              {isGit && (changes.totalAdded > 0 || changes.totalRemoved > 0) && (
                <span className="shrink-0 tabular-nums">
                  <LineCounts added={changes.totalAdded} removed={changes.totalRemoved} />
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {firstRead && showSkeleton && <SkeletonRows />}

      {showRows && (
        <div
          className={cn(
            skeletonShown && 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150'
          )}
        >
          {capped ? (
            rows
          ) : (
            <div className="scroller-thin max-h-72 overflow-y-auto overscroll-contain">{rows}</div>
          )}
          {capped && (
            <button
              type="button"
              onClick={onOpenGit}
              className={cn(
                'flex h-8 w-full items-center rounded-md pl-8 pr-2.5 text-left text-xs text-muted-foreground',
                'transition-colors duration-150 ease-out motion-reduce:transition-none',
                'hover:bg-row-hover-solid hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring'
              )}
            >
              Show {fileCount - MAX_ROWS} more
            </button>
          )}
        </div>
      )}

      {showEmpty && (
        <p className="px-2.5 py-2 text-xs text-secondary-foreground">
          No uncommitted changes from this chat
        </p>
      )}

      {errorMessage !== undefined && (
        <div role="alert" className="flex flex-col items-start gap-1 px-2.5 py-2">
          <p className="text-xs text-destructive">Could not read Git status.</p>
          <p className="break-words text-xs text-muted-foreground">{errorMessage}</p>
          <Button type="button" variant="secondary" size="xs" className="mt-1" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {showRows && phase === 'idle' && (canDiscard || openGitButton) && (
        <PanelFooter>
          <div className="flex items-center gap-2">
            {canDiscard && (
              <DiscardAllButton
                buttonRef={discardRef}
                disabled={turnActive}
                onClick={() => setPhase('confirm')}
              />
            )}
            {openGitButton}
          </div>
        </PanelFooter>
      )}

      {showRows && phase !== 'idle' && (
        <PanelFooter>
          <div className="flex flex-col gap-2 px-1.5 pb-1">
            <p className="text-xs leading-5 text-foreground">
              Discard changes in {plural(fileCount, 'file')}? New files are deleted, and your own
              edits in these files go too. You can't undo this.
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button
                ref={cancelRef}
                type="button"
                variant="secondary"
                size="xs"
                disabled={phase === 'running'}
                onClick={() => setPhase('idle')}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                disabled={phase === 'running' || turnActive}
                onClick={() => void discardAll()}
              >
                {phase === 'running' ? (
                  <>
                    <Spinner size={12} decorative />
                    Discarding…
                  </>
                ) : (
                  `Discard ${plural(fileCount, 'file')}`
                )}
              </Button>
            </div>
          </div>
        </PanelFooter>
      )}

      {showEmpty && openGitButton && (
        <PanelFooter>
          <div className="flex items-center">{openGitButton}</div>
        </PanelFooter>
      )}
    </div>
  )
}

function DiscardAllButton({
  buttonRef,
  disabled,
  onClick
}: {
  buttonRef: React.Ref<HTMLButtonElement>
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  const button = (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled}
      onClick={onClick}
      className="px-2 text-destructive hover:text-destructive"
    >
      Discard all
    </Button>
  )
  if (!disabled) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a disabled button cannot focus; the wrapper lets keyboard users reach the reason
          tabIndex={0}
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>Stop the turn to discard</TooltipContent>
    </Tooltip>
  )
}

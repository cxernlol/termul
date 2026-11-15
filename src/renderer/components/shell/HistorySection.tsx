import type { GitCommit } from '@shared/types/ipc.types'
import type React from 'react'
import { useEffect, useState } from 'react'
import { Check, ChevronDown, ExternalLink } from '@/components/icons'
import { FOCUS_RING_CLASS, QUIET_ICON_BUTTON_CLASS } from '@/components/ui/panel-styles'
import { describeRef } from '@/lib/git-ref'
import { formatRelativeTime } from '@/lib/relative-time'
import { cn } from '@/lib/utils'
import { normalizePath } from '@/lib/working-copy'
import { GIT_LOG_LIMIT, useGitHistoryStore } from '@/stores/git-history-store'
import { type GitStatusState, useGitStatusStore } from '@/stores/git-status-store'
import { findPaneContainingTab, gitHistoryTabId, useWorkspaceStore } from '@/stores/workspace-store'

/** The commit-context fields a commit or a branch switch changes, as one string. */
function headSignatureOf(state: Pick<GitStatusState, 'commitContexts'>, cwd: string): string {
  const context = state.commitContexts[normalizePath(cwd)]
  if (!context) return ''
  const { branch, hasHead, lastSubject, ahead, behind } = context
  return [branch, hasHead, lastSubject, ahead, behind].join('\u0000')
}

/** `1,284 commits`, with a plus when the read reached {@link GIT_LOG_LIMIT}. */
function commitCountLabel(count: number): string {
  const plus = count >= GIT_LOG_LIMIT ? '+' : ''
  return `${count.toLocaleString('en-US')}${plus} ${count === 1 ? 'commit' : 'commits'}`
}

interface HistorySectionProps {
  cwd: string
  isVisible: boolean
}

/**
 * Bottom section of the shell Changes panel (Paper "History section"): the
 * length of the HEAD history and its newest commits on a one-lane graph. It
 * reads through its own HEAD-scoped log, so the History tab's scope does not
 * change it, and reloads when the working copy's commit context (branch, last
 * subject, ahead/behind) changes, as after a commit. "View all" and "Show all"
 * open (or focus) the Git History tab in the main panel; a check shows while
 * that tab is open.
 */
export function HistorySection({ cwd, isVisible }: HistorySectionProps): React.JSX.Element {
  const summary = useGitHistoryStore((state) => state.headSummary[cwd])
  const refreshHeadSummary = useGitHistoryStore((state) => state.refreshHeadSummary)
  const headSignature = useGitStatusStore((state) => headSignatureOf(state, cwd))
  const addGitHistoryTab = useWorkspaceStore((state) => state.addGitHistoryTab)
  const isOpen = useWorkspaceStore(
    (state) => findPaneContainingTab(state.root, gitHistoryTabId(cwd)) !== null
  )
  const [expanded, setExpanded] = useState(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: headSignature is the reload trigger, not a value read inside the effect.
  useEffect(() => {
    if (isVisible) void refreshHeadSummary(cwd)
  }, [isVisible, cwd, headSignature, refreshHeadSummary])

  const recent = summary?.recent ?? []
  const count = summary?.count ?? 0
  const hasMore = count > recent.length
  const openHistory = () => addGitHistoryTab(cwd)

  return (
    <section
      aria-label="History"
      className="flex shrink-0 flex-col border-t-[0.5px] border-border pb-1.5"
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 pr-1.5 pl-3">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-md text-left text-2xs',
            FOCUS_RING_CLASS
          )}
        >
          <ChevronDown
            size={12}
            aria-hidden
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-150 ease-out',
              !expanded && '-rotate-90'
            )}
          />
          <span className="shrink-0 font-medium text-secondary-foreground">History</span>
          <span className="truncate tabular-nums text-muted-foreground">
            {summary === undefined ? '' : commitCountLabel(count)}
          </span>
        </button>
        <button
          type="button"
          onClick={openHistory}
          aria-label={isOpen ? 'History, open in the main panel' : 'Open History in the main panel'}
          className={cn(
            QUIET_ICON_BUTTON_CLASS,
            'h-6 shrink-0 gap-[5px] px-[7px] text-2xs font-medium text-secondary-foreground'
          )}
        >
          View all
          {isOpen ? <Check size={12} aria-hidden /> : <ExternalLink size={12} aria-hidden />}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col px-1.5">
          {summary === undefined || recent.length === 0 ? (
            <p className="flex h-[26px] items-center px-1.5 text-2xs text-muted-foreground">
              {summary === undefined ? 'Loading...' : 'No commits yet'}
            </p>
          ) : (
            <ol aria-label="Recent commits" className="flex flex-col">
              {recent.map((commit, index) => (
                <CommitRow
                  key={commit.hash}
                  commit={commit}
                  isHead={index === 0}
                  lineAbove={index > 0}
                  lineBelow={index < recent.length - 1 || hasMore}
                />
              ))}
            </ol>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={openHistory}
              className={cn(
                'flex h-7 shrink-0 items-center gap-2 rounded-md px-1.5 text-left text-2xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-foreground/[0.03] hover:text-foreground',
                FOCUS_RING_CLASS
              )}
            >
              <svg
                width="12"
                height="26"
                viewBox="0 0 12 26"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  d="M6 0V12"
                  className="stroke-primary"
                  strokeWidth="1.5"
                  strokeDasharray="2 3"
                />
              </svg>
              {`Show all ${commitCountLabel(count)}`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** Ref chips per row; the History tab lists the rest. */
const MAX_REF_CHIPS = 2

/** One commit on the one-lane graph: dot, subject, then ref chips or the age. */
function CommitRow({
  commit,
  isHead,
  lineAbove,
  lineBelow
}: {
  commit: GitCommit
  isHead: boolean
  lineAbove: boolean
  lineBelow: boolean
}): React.JSX.Element {
  const subject = commit.subject || '(no message)'
  return (
    <li className="flex h-[26px] shrink-0 items-center gap-2 rounded-md px-1.5" title={subject}>
      <svg width="12" height="26" viewBox="0 0 12 26" aria-hidden="true" className="shrink-0">
        {lineAbove && <path d="M6 0V13" className="stroke-primary" strokeWidth="1.5" />}
        {lineBelow && <path d="M6 13V26" className="stroke-primary" strokeWidth="1.5" />}
        {isHead ? (
          <circle cx="6" cy="13" r="3.75" className="fill-card stroke-primary" strokeWidth="1.5" />
        ) : (
          <circle cx="6" cy="13" r="3.5" className="fill-primary" />
        )}
      </svg>
      <span
        className={cn(
          'fade-end min-w-0 flex-1 text-2xs',
          isHead ? 'font-medium text-foreground' : 'text-secondary-foreground'
        )}
      >
        {subject}
      </span>
      {commit.refs.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          {commit.refs.slice(0, MAX_REF_CHIPS).map((ref) => (
            <CommitRefChip key={ref} raw={ref} />
          ))}
        </span>
      ) : (
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          {formatRelativeTime(commit.date)}
        </span>
      )}
    </li>
  )
}

/** Paper ref chip: the checked-out branch filled in the primary tint, other refs outlined. */
function CommitRefChip({ raw }: { raw: string }): React.JSX.Element {
  const { label, kind } = describeRef(raw)
  return (
    <span
      className={cn(
        'flex h-4 max-w-24 items-center rounded-full px-[5px] text-4xs font-medium',
        kind === 'head'
          ? 'bg-primary/16 text-primary'
          : 'text-muted-foreground outline-[0.5px] outline-border outline-solid'
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

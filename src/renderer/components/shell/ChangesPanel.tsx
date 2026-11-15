import type { GitStatusDetail } from '@shared/types/ipc.types'
import type React from 'react'
import { useCallback } from 'react'
import { BranchSection } from '@/components/git/BranchSection'
import { CommitComposer } from '@/components/git/CommitComposer'
import { GitChangeList } from '@/components/git/GitChangeList'
import { GitPanelDialogs } from '@/components/git/GitPanelDialogs'
import { ChangesFilter } from '@/components/git/rows'
import { StashMenu } from '@/components/git/StashMenu'
import { useGitActions } from '@/components/git/use-git-actions'
import { useGitPanelModel } from '@/components/git/use-git-panel-model'
import { useGitSelection } from '@/components/git/use-git-selection'
import { HistorySection } from '@/components/shell/HistorySection'
import { SidePanelHeader } from '@/components/shell/SidePanelHeader'
import { useWorkspaceActions } from '@/stores/workspace-store/selectors'

interface ChangesPanelProps {
  /** Working copy the panel shows; the caller resolves it. */
  cwd: string
  isVisible: boolean
}

/**
 * Shell Changes panel (CAP-8, Paper "Side panel · Changes"): the 44px panel
 * header with the branch button and the stash menu (stashes live there, not
 * in the body), then the Git tab's parts in one narrow column, then the History
 * section at the bottom. The middle region (commit box, filter, Change list)
 * scrolls on its own. A plain
 * file click opens the Diff tab; the diff itself is not shown here. Draws its
 * own header, like the Explorer, because the header actions need its state.
 */
export function ChangesPanel({ cwd, isVisible }: ChangesPanelProps): React.JSX.Element {
  const { addDiffTab } = useWorkspaceActions()

  const {
    selectedFile,
    stashes,
    branches,
    searchQuery,
    setSearchQuery,
    stagedFiles,
    unstagedFiles,
    statusError
  } = useGitPanelModel({ cwd, isVisible })

  const {
    selectedStaged,
    setSelectedStaged,
    selectedPaths,
    selectionSection,
    clearSelection,
    handleFileClick,
    targetsFor
  } = useGitSelection()

  const actions = useGitActions({ cwd, setSelectedStaged, clearSelection })
  const {
    isMutating,
    setIsCreateBranchOpen,
    setIsStashOpen,
    summary,
    setSummary,
    description,
    setDescription,
    amend,
    isCommitting,
    isGenerating,
    isPushing,
    hasUncommittedChanges,
    commitContext,
    stagedCount,
    hasUsableAgent,
    canGenerate,
    canCommit,
    runStage,
    runUnstage,
    requestDiscard,
    handleToggleAmend,
    handleGenerateMessage,
    handleCommit,
    handlePush,
    handleSwitchBranch,
    handleApplyStash,
    handlePopStash,
    handleDropStash
  } = actions

  const stagedSelectionCount = selectionSection === 'staged' ? selectedPaths.size : 0
  const unstagedSelectionCount = selectionSection === 'unstaged' ? selectedPaths.size : 0

  // Selection always follows the click; only a plain click also opens the Diff
  // tab (shift / ctrl / meta clicks are selection gestures).
  const onFileClick = useCallback(
    (
      e: React.MouseEvent | React.KeyboardEvent,
      path: string,
      staged: boolean,
      sectionFiles: GitStatusDetail[]
    ) => {
      handleFileClick(e, path, staged, sectionFiles)
      if (e.shiftKey || e.ctrlKey || e.metaKey) return
      addDiffTab(cwd, path, staged)
    },
    [handleFileClick, addDiffTab, cwd]
  )

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-background overflow-hidden">
      <SidePanelHeader title="Changes">
        <BranchSection
          variant="panel"
          branches={branches}
          currentBranch={commitContext?.branch}
          ahead={commitContext?.ahead ?? 0}
          onCreateBranch={() => setIsCreateBranchOpen(true)}
          onSwitchBranch={handleSwitchBranch}
        />
        <StashMenu
          stashes={stashes}
          canStash={hasUncommittedChanges && !isGenerating}
          isMutating={isMutating}
          onStash={() => setIsStashOpen(true)}
          onApply={handleApplyStash}
          onPop={handlePopStash}
          onDrop={handleDropStash}
        />
      </SidePanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <CommitComposer
          variant="panel"
          summary={summary}
          onSummaryChange={setSummary}
          description={description}
          onDescriptionChange={setDescription}
          amend={amend}
          onToggleAmend={handleToggleAmend}
          isCommitting={isCommitting}
          isGenerating={isGenerating}
          isPushing={isPushing}
          commitContext={commitContext}
          stagedCount={stagedCount}
          hasUsableAgent={hasUsableAgent}
          canGenerate={canGenerate}
          canCommit={canCommit}
          onGenerateMessage={handleGenerateMessage}
          onCommit={handleCommit}
          onPush={handlePush}
        />

        <div className="px-2 pt-2 pb-0.5">
          <ChangesFilter value={searchQuery} onChange={setSearchQuery} />
        </div>

        <GitChangeList
          variant="column"
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          statusError={statusError}
          selectedFile={selectedFile}
          selectedStaged={selectedStaged}
          selectionSection={selectionSection}
          selectedPaths={selectedPaths}
          stagedSelectionCount={stagedSelectionCount}
          unstagedSelectionCount={unstagedSelectionCount}
          isMutating={isMutating}
          isGenerating={isGenerating}
          onFileClick={onFileClick}
          targetsFor={targetsFor}
          runStage={runStage}
          runUnstage={runUnstage}
          requestDiscard={requestDiscard}
          onApplyStash={handleApplyStash}
          onPopStash={handlePopStash}
          onDropStash={handleDropStash}
        />
      </div>

      <HistorySection cwd={cwd} isVisible={isVisible} />

      <GitPanelDialogs actions={actions} />
    </div>
  )
}

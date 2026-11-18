import type { ReactNode } from 'react'
import { lazy, Suspense } from 'react'
import { MobileSheetContent } from '@/components/ui/mobile-sheet'
import { Sheet } from '@/components/ui/sheet'
import { PaneDndProvider } from '@/hooks/use-pane-dnd'
import { ShellSkeleton } from '@/layouts/workspace-layout/ShellSkeleton'
import { terminalApi } from '@/lib/api'
import { sheetCloseAutoFocus } from '@/lib/sheet-focus-return'
import { useReportBugStore } from '@/stores/report-bug-store'
import { useTerminalActions, useTerminalStore } from '@/stores/terminal-store'
import { findPaneContainingTab, useWorkspaceStore } from '@/stores/workspace-store'
import type { Project } from '@/types/project'

const GitPanel = lazy(() =>
  import('@/components/git/GitPanel').then((m) => ({ default: m.GitPanel }))
)
const MobileChatShell = lazy(() =>
  import('@/components/mobile/MobileChatShell').then((m) => ({ default: m.MobileChatShell }))
)

interface MobileWorkspaceShellProps {
  activeProject: Project | undefined
  activeProjectId: string
  gitSheetOpen: boolean
  gitSheetCwd: string | null
  openGitSheet: () => void
  closeGitSheet: () => void
  handleOpenAgentChat: () => void
  handleAddGitHistoryTab: (paneId?: string) => void
  handleAddTerminal: (paneId: string | undefined) => void
  handleCloseTerminal: (id: string, tabId: string) => boolean
  handleCloseEditorTab: (filePath: string) => boolean
  handleOpenProjectSettings: () => void
  handleOpenCommandHistory: () => void
  handleCreateTerminalInPane: (paneId: string, shellName?: string) => Promise<void>
  setIsCommandPaletteOpen: (open: boolean) => void
  setIsNewProjectModalOpen: (open: boolean) => void
  /** The `workspaceMain` element, rendered inside the mobile `<main>`. */
  workspaceMain: ReactNode
  /** The `appModals` element, rendered after the shell. */
  appModals: ReactNode
}

/** Mobile web shell: chat shell around the workspace main, Git Changes sheet and modals. */
export function MobileWorkspaceShell({
  activeProject,
  activeProjectId,
  gitSheetOpen,
  gitSheetCwd,
  openGitSheet,
  closeGitSheet,
  handleOpenAgentChat,
  handleAddGitHistoryTab,
  handleAddTerminal,
  handleCloseTerminal,
  handleCloseEditorTab,
  handleOpenProjectSettings,
  handleOpenCommandHistory,
  handleCreateTerminalInPane,
  setIsCommandPaletteOpen,
  setIsNewProjectModalOpen,
  workspaceMain,
  appModals
}: MobileWorkspaceShellProps): React.JSX.Element {
  const { closeTerminal, renameTerminal } = useTerminalActions()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)]">
      {/* pt-[env(safe-area-inset-top)] (Story 7, QA F2): with
          `viewport-fit=cover` the webview extends under the notch; the shell
          root pads by the top inset so the header's 44px buttons clear
          the cutout. Evaluates to 0 on non-notch devices (no extra padding). */}
      {/* Safari on iOS blurs the page under its bars unless a fixed strip
          with a solid fill touches that edge; then it extends the strip's
          fill instead. Without the top strip the blur lands on the header.
          Safari needs at least 5px of a strip to be visible. Both strips
          stay inside the shell's top and bottom padding, so they cover no
          content. Source: joshpuckett.me/seamless-mobile-safari. */}
      <div
        aria-hidden="true"
        data-safari-edge="top"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[max(5px,env(safe-area-inset-top))] bg-background"
      />
      <div
        aria-hidden="true"
        data-safari-edge="bottom"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[max(5px,env(safe-area-inset-bottom))] bg-background"
      />
      <Suspense fallback={<ShellSkeleton />}>
        <MobileChatShell
          onNewChat={handleOpenAgentChat}
          canNewChat
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenGitChanges={() => openGitSheet()}
          onOpenGitHistory={() => handleAddGitHistoryTab()}
          onNewProject={() => setIsNewProjectModalOpen(true)}
          onNewTerminal={() => handleAddTerminal(undefined)}
          onCloseTerminal={handleCloseTerminal}
          onRenameTerminal={renameTerminal}
          onCloseEditorTab={handleCloseEditorTab}
          onOpenProjectSettings={handleOpenProjectSettings}
          onReportBug={() => useReportBugStore.getState().openReport()}
          onOpenCommandHistory={activeProjectId ? handleOpenCommandHistory : undefined}
          onRestartTerminal={(terminalId) => {
            // Restart: kill the PTY, close the old tab, then re-spawn.
            const terminal = useTerminalStore.getState().terminals.find((t) => t.id === terminalId)
            if (!terminal?.ptyId) return
            const root = useWorkspaceStore.getState().root
            const pane = findPaneContainingTab(root, `term-${terminalId}`)
            void terminalApi.kill(terminal.ptyId).then(() => {
              closeTerminal(terminalId, activeProjectId)
              if (pane) {
                useWorkspaceStore.getState().closeTab(pane.id, `term-${terminalId}`)
              }
              handleCreateTerminalInPane(
                pane?.id ?? useWorkspaceStore.getState().activePaneId ?? '',
                terminal.shell ?? undefined
              )
            })
          }}
        >
          <PaneDndProvider>
            {/* flex-1 (not h-full): percentage heights against the
                flex-sized wrapper do not resolve in every engine, which
                collapses the workspace to 0 height. */}
            <main className="flex min-h-0 flex-1 flex-col overflow-clip bg-background">
              {workspaceMain}
            </main>
          </PaneDndProvider>
        </MobileChatShell>
      </Suspense>

      {/* Mobile-only full-width Git Changes sheet. GitPanel branches on
          useMobileWebShell() internally to render a single-column stacked
          layout (file list → diff + back). Only mounted in the mobile path
          so the desktop two-column GitPanel (a workspace tab) is untouched.
          The `open` prop is gated on `activeProject?.path` in addition to
          `gitSheetOpen` so the sheet can never be open during the
          empty-content race when the active project loses its path; the
          `useEffect` above also closes the store to keep state honest. */}
      <Sheet
        open={gitSheetOpen && Boolean(gitSheetCwd && activeProject?.path)}
        onOpenChange={(next) => !next && closeGitSheet()}
      >
        {/* Story 10 (QA F9/F7): the git sheet is no longer a radius-0
            full-screen takeover — rounded top corners + max-height
            (content scrolls inside; the app stays visible behind the
            overlay). p-0 matches the mobile sheet family; the GitPanel
            block owns its internal p-2 rhythm. Story 7 keeps the
            safe-area-inset-bottom pad so the footer clears the home
            indicator. The phone sheet (MobileSheetContent) adds the grab
            handle and drag to close. The sheet keeps a fixed tall height, so
            the view area under the header (its last child) grows to fill it
            and GitPanel gets a definite height. */}
        <MobileSheetContent
          title="Git changes"
          className="h-[calc(90dvh-env(safe-area-inset-top))] max-h-[calc(90dvh-env(safe-area-inset-top))] [&>div:last-child]:flex-1"
          bodyClassName="gap-0 p-0 pb-[env(safe-area-inset-bottom)]"
          aria-label="Git changes"
          aria-describedby={undefined}
          onCloseAutoFocus={sheetCloseAutoFocus('git-sheet')}
        >
          {gitSheetCwd ? (
            <Suspense fallback={<ShellSkeleton />}>
              <GitPanel cwd={gitSheetCwd} isVisible={gitSheetOpen} />
            </Suspense>
          ) : null}
        </MobileSheetContent>
      </Sheet>

      {appModals}
    </div>
  )
}

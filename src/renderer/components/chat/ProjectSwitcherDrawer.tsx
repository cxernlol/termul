import { useState } from 'react'
import { toast } from 'sonner'
import { FolderGit2, Home, Plus, Settings } from '@/components/icons'
import { SHEET_ROW_CLASS_NAME } from '@/components/mobile/mobile-sheet-rows'
import { ProjectIcon } from '@/components/ProjectIcon'
import { Button } from '@/components/ui/button'
import { MobileSheetContent } from '@/components/ui/mobile-sheet'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useProjectSwitch } from '@/hooks/use-project-switch'
import { projectRegistryApi } from '@/lib/project-registry-api'
import { useProjectStore } from '@/stores/project-store'
import type { Project } from '@/types/project'

interface ProjectSwitcherDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the existing New project flow. Omitted when that action is not available. */
  onAddProject?: () => void
  /** Opens Project settings for the active project. Omitted when that action is not available. */
  onOpenProjectSettings?: () => void
  /** Edge the sheet opens from. `left` (default) is the desktop-style side drawer. */
  side?: 'left' | 'bottom'
  /** DOM id for the sheet content, so a trigger can point `aria-controls` at it. */
  id?: string
  /** Radix close auto-focus hook; the opener is a plain Button, so the owner returns focus. */
  onCloseAutoFocus?: (event: Event) => void
}

const LEFT_CLASS_NAME = 'flex w-[72vw] max-w-20rem flex-col gap-0 p-0 sm:max-w-sm'

/** The phone sheet scrolls as one body; the 85dvh cap keeps the app in view above it. */
const BOTTOM_CLASS_NAME = 'max-h-[85dvh]'
const BOTTOM_BODY_CLASS_NAME = 'gap-0 p-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]'

/**
 * A row's trailing icon button (Project settings, Set as host default): a
 * 44px target round an 18px icon. A touch has no hover, so the press shows
 * the hover fill.
 */
const ROW_ICON_BUTTON_CLASS_NAME =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-row-hover hover:text-foreground active:bg-row-hover active:text-foreground'

const DESCRIPTION = "Switch the session to another project or open the current project's settings"

/**
 * Project switcher. Lists the host's projects (the project store, fed by the
 * `projects` watch) and makes the picked project this client's active one.
 * Switching is client-only: no host request, no effect on other devices.
 * Archived projects render greyed + are not clickable. The currently active
 * project is marked by the keycap surface and a "Current" label.
 *
 * Epic 7 (cross-client continuity): a project `isDefault` (the host default,
 * set by the host's `default_project_id`) shows a "Default" label. The
 * "Set as host default" action goes through the project registry facade on every
 * surface — distinct from the client-only switch (which only updates this
 * client's `activeProjectId`).
 */
export function ProjectSwitcherDrawer({
  open,
  onOpenChange,
  onAddProject,
  onOpenProjectSettings,
  side = 'left',
  id,
  onCloseAutoFocus
}: ProjectSwitcherDrawerProps): React.JSX.Element {
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { switchTo } = useProjectSwitch('ProjectSwitcherDrawer')
  const [defaultingId, setDefaultingId] = useState<string | null>(null)

  function handleSwitch(project: Project): void {
    if (switchTo(project.id) === 'selected') onOpenChange(false)
  }

  // Explicit host-default change (Epic 7). Distinct from the client-only
  // switch: updates the host default that devices with no choice of their own
  // start on. The label moves when the `projects` watch delivers the new state.
  async function handleSetDefault(project: Project): Promise<void> {
    if (defaultingId !== null) return
    setDefaultingId(project.id)
    try {
      await projectRegistryApi.setDefault(project.id)
      toast.success(`"${project.name}" is now the host default`)
    } catch (err) {
      // P15: guard against an undefined message (avoid an "undefined" toast).
      toast.error(`Failed to set host default: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDefaultingId(null)
    }
  }

  const list =
    projects.length === 0 ? (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        No projects available. Add one to get started.
      </p>
    ) : (
      <ul className="flex flex-col gap-0.5">
        {projects.map((project) => {
          const isArchived = project.isArchived ?? false
          const isActive = project.id === activeProjectId
          const isHostDefault = project.isDefault === true
          const isSettingDefault = defaultingId === project.id
          const switchDisabled = isArchived || isActive
          return (
            <li key={project.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={switchDisabled}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => handleSwitch(project)}
                className={[
                  SHEET_ROW_CLASS_NAME,
                  'min-w-0 flex-1 text-left',
                  // The keycap, as for the open chat in the desktop chat list.
                  isActive ? 'keycap text-foreground' : '',
                  isArchived ? 'text-disabled-foreground' : '',
                  switchDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                ].join(' ')}
              >
                <ProjectIcon project={project} size={18} />
                <span
                  className={
                    isArchived
                      ? 'min-w-0 flex-1 truncate text-disabled-foreground'
                      : 'min-w-0 flex-1 truncate text-foreground'
                  }
                >
                  {project.name}
                </span>
                {isHostDefault && (
                  <span
                    title="Host default (new clients start here)"
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Home size={14} aria-hidden="true" />
                    Default
                  </span>
                )}
                {isActive && (
                  <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                )}
              </button>
              {/* Project settings act on the active project only, so the
               * gear sits on the Current row: on another row it would
               * first have to switch the active project. */}
              {isActive && onOpenProjectSettings && (
                <button
                  type="button"
                  aria-label={`"${project.name}" project settings`}
                  title="Project settings"
                  onClick={() => {
                    onOpenChange(false)
                    onOpenProjectSettings()
                  }}
                  className={ROW_ICON_BUTTON_CLASS_NAME}
                >
                  <Settings size={18} />
                </button>
              )}
              {/* Set as host default (Epic 7) — distinct from the
               * client-only switch. Hidden when already the host
               * default (no-op), archived, or pathless (P5: a
               * pathless project can't be a default — the host would
               * reject it with NOT_FOUND). A truthy `project.path`
               * also hides the control for an empty-string path, which
               * the host would equally reject. */}
              {!isHostDefault && !isArchived && !!project.path && (
                <button
                  type="button"
                  disabled={isSettingDefault || defaultingId !== null}
                  aria-label={`Set "${project.name}" as host default`}
                  title="Set as host default"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleSetDefault(project)
                  }}
                  className={[
                    ROW_ICON_BUTTON_CLASS_NAME,
                    isSettingDefault
                      ? 'cursor-wait'
                      : defaultingId !== null
                        ? 'cursor-not-allowed text-disabled-foreground'
                        : ''
                  ].join(' ')}
                >
                  {isSettingDefault ? <Spinner size={18} decorative /> : <Home size={18} />}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    )

  const addProjectRow = onAddProject ? (
    <button
      type="button"
      className={SHEET_ROW_CLASS_NAME}
      onClick={() => {
        onOpenChange(false)
        onAddProject()
      }}
    >
      <Plus size={18} aria-hidden="true" />
      Add project
    </button>
  ) : null

  if (side === 'bottom') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <MobileSheetContent
          id={id}
          title="Projects"
          className={BOTTOM_CLASS_NAME}
          bodyClassName={BOTTOM_BODY_CLASS_NAME}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <SheetDescription className="sr-only">{DESCRIPTION}</SheetDescription>
          {/* 8px round the rows puts their icons 20px from the screen edge. */}
          <div className="p-2">{list}</div>
          {/* Pinned to the foot of the scrolling body, so a long project
           * list never pushes the only creation entry out of reach. */}
          {addProjectRow && (
            <div className="sticky bottom-0 border-t border-border/60 bg-popover p-2">
              {addProjectRow}
            </div>
          )}
        </MobileSheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        id={id}
        onCloseAutoFocus={onCloseAutoFocus}
        className={LEFT_CLASS_NAME}
      >
        <SheetHeader className="space-y-0 border-b border-border/60 p-2 text-left">
          <div className="flex items-center gap-2 pr-8">
            <FolderGit2 size={20} />
            <SheetTitle className="text-base">Projects</SheetTitle>
          </div>
          <SheetDescription className="sr-only">{DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-2">{list}</div>
        {/* Pinned below the scrolling list so a long project list never pushes
         * the only creation entry out of reach. */}
        {onAddProject && (
          <div className="shrink-0 border-t border-border/60 p-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full justify-start"
              onClick={() => {
                onOpenChange(false)
                onAddProject()
              }}
            >
              <Plus size={16} />
              Add project
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

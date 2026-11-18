import { type Dispatch, type SetStateAction, useMemo, useState } from 'react'
import { RotateCcw, Search } from '@/components/icons'
import { ShortcutRecorder } from '@/components/ShortcutRecorder'
import { SettingsCard, SettingsGroup } from '@/components/settings/SettingsGroup'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { Button } from '@/components/ui/button'
import { PANEL_FIELD_CLASS, PANEL_FIELD_ICON_CLASS } from '@/components/ui/panel-styles'
import { isTauriContext } from '@/lib/tauri-runtime'
import { cn } from '@/lib/utils'
import type { KeyboardShortcut, KeyboardShortcutsConfig } from '@/types/settings'

/**
 * Shortcut ids that are desktop-only (issue #843): hidden from the web
 * preferences list instead of shown as unbindable entries.
 */
const DESKTOP_ONLY_SHORTCUT_IDS: Record<string, true> = { newBrowserTab: true }

/** Display groups, in order. Ids that are not listed fall into "Other". */
const SHORTCUT_GROUPS: Array<{ title: string; ids: string[] }> = [
  {
    title: 'General',
    ids: [
      'commandPalette',
      'commandPaletteAlt',
      'commandHistory',
      'newTerminal',
      'colorThemePicker',
      'settings'
    ]
  },
  {
    title: 'Tabs and panels',
    ids: [
      'newBrowserTab',
      'nextTerminal',
      'prevTerminal',
      'closeTab',
      'sidebarToggle',
      'toggleFileExplorer'
    ]
  },
  { title: 'Zoom', ids: ['zoomIn', 'zoomOut', 'zoomReset'] },
  {
    title: 'Files and search',
    ids: ['newProject', 'saveFile', 'fileExplorerRename', 'fileExplorerDelete', 'terminalSearch']
  },
  {
    title: 'Worktrees',
    ids: [
      'worktreeCreate',
      'worktreeSwitchNext',
      'worktreeSwitchPrev',
      'worktreeOpenTerminal',
      'worktreeSwitchRoot'
    ]
  }
]

function groupShortcuts(
  shortcuts: KeyboardShortcut[]
): Array<{ title: string; items: KeyboardShortcut[] }> {
  const known = new Set(SHORTCUT_GROUPS.flatMap((group) => group.ids))
  const byId = new Map(shortcuts.map((shortcut) => [shortcut.id, shortcut]))
  const groups = SHORTCUT_GROUPS.map((group) => ({
    title: group.title,
    items: group.ids.flatMap((id) => {
      const shortcut = byId.get(id)
      return shortcut ? [shortcut] : []
    })
  }))
  const other = shortcuts.filter((shortcut) => !known.has(shortcut.id))
  return [...groups, { title: 'Other', items: other }].filter((group) => group.items.length > 0)
}

interface ShortcutsSectionProps {
  shortcuts: KeyboardShortcutsConfig
  updateShortcut: (id: string, customKey: string) => void
  resetShortcut: (id: string) => void
  setIsResetShortcutsDialogOpen: Dispatch<SetStateAction<boolean>>
}

export function ShortcutsSection({
  shortcuts,
  updateShortcut,
  resetShortcut,
  setIsResetShortcutsDialogOpen
}: ShortcutsSectionProps): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()

  const groups = useMemo(() => {
    const visible = Object.values(shortcuts)
      .filter((shortcut) => isTauriContext() || !DESKTOP_ONLY_SHORTCUT_IDS[shortcut.id])
      .filter(
        (shortcut) =>
          !query ||
          shortcut.label.toLowerCase().includes(query) ||
          shortcut.description.toLowerCase().includes(query)
      )
    return groupShortcuts(visible)
  }, [shortcuts, query])

  return (
    <SettingsSection id="shortcuts">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} aria-hidden className={PANEL_FIELD_ICON_CLASS} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter shortcuts"
            aria-label="Filter shortcuts"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className={cn(
              PANEL_FIELD_CLASS,
              'h-8 pointer-coarse:h-11 w-full bg-background pl-7 pr-3'
            )}
          />
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setIsResetShortcutsDialogOpen(true)}
        >
          <RotateCcw size={13} />
          Reset all shortcuts
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground">No shortcuts match "{filter.trim()}".</p>
          <Button type="button" size="xs" variant="outline" onClick={() => setFilter('')}>
            Clear filter
          </Button>
        </div>
      ) : (
        groups.map((group) => (
          <SettingsGroup key={group.title} title={group.title}>
            <SettingsCard>
              {group.items.map((shortcut) => (
                <ShortcutRecorder
                  key={shortcut.id}
                  variant="row"
                  shortcut={shortcut}
                  allShortcuts={shortcuts}
                  onUpdate={updateShortcut}
                  onReset={resetShortcut}
                />
              ))}
            </SettingsCard>
          </SettingsGroup>
        ))
      )}
    </SettingsSection>
  )
}

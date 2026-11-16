import { useEffect, useLayoutEffect, useRef } from 'react'
import { Bug, Palette, SlidersHorizontal } from '@/components/icons'
import { RailButton, type RailButtonSize, railButtonClass } from '@/components/shell/rail-button'
import { useShortcutLabel } from '@/components/shell/use-shortcut-label'
import { TitleBarShortcutsPopover } from '@/components/TitleBarShortcutsPopover'
import { cn } from '@/lib/utils'
import { useReportBugStore } from '@/stores/report-bug-store'
import { useSettingsModalStore, useSettingsModalView } from '@/stores/settings-modal-store'
import { useRailCollapsed } from './rail/rail-density'
import { RAIL_BLOCK_FADE_CLASS } from './rail/rail-motion'

interface RailFooterProps {
  isShortcutsOpen: boolean
  onShortcutsOpenChange: (open: boolean) => void
  isThemePickerOpen: boolean
  onToggleThemePicker?: () => void
}

interface RailUtilityButtonsProps {
  isShortcutsOpen: boolean
  onShortcutsOpenChange: (open: boolean) => void
  isThemePickerOpen: boolean
  onToggleThemePicker?: () => void
  size: RailButtonSize
  className?: string
}

/**
 * The Theme picker and Shortcuts buttons, shared by the expanded footer and
 * the collapsed Rail. Closing the picker or the shortcuts popover returns
 * focus to its button when focus fell to the page body.
 */
export function RailUtilityButtons({
  isShortcutsOpen,
  onShortcutsOpenChange,
  isThemePickerOpen,
  onToggleThemePicker,
  size,
  className
}: RailUtilityButtonsProps): React.JSX.Element {
  const buttonsRef = useRef<HTMLDivElement>(null)
  const wasThemePickerOpen = useRef(false)

  useEffect(() => {
    const wasOpen = wasThemePickerOpen.current
    wasThemePickerOpen.current = isThemePickerOpen
    if (!wasOpen || isThemePickerOpen) return
    // The picker unmounts with the store flag; wait one frame so the browser
    // has moved focus to the body before deciding whether to restore it.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body) return
      buttonsRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="Color themes"]')
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [isThemePickerOpen])

  return (
    <div ref={buttonsRef} className={cn('flex shrink-0 items-center', className)}>
      <RailButton
        label="Color themes"
        size="base"
        aria-label="Color themes"
        pressed={onToggleThemePicker ? isThemePickerOpen : undefined}
        disabled={!onToggleThemePicker}
        onClick={() => onToggleThemePicker?.()}
      >
        <Palette size={14} />
      </RailButton>

      <TitleBarShortcutsPopover
        buttonClassName={railButtonClass(isShortcutsOpen, size)}
        open={isShortcutsOpen}
        onOpenChange={onShortcutsOpenChange}
        restoreFocusOnClose
      />
    </div>
  )
}

/**
 * Rail footer (Paper 2.2 "Rail footer"). Expanded: one row of 32px icon
 * buttons at the left, 2px apart: Settings, Report a bug, Theme picker,
 * Shortcuts. Collapsed: the same buttons stack upward from the bottom
 * (column-reverse, 4px apart, 6px top and bottom). Both start 12px from the
 * Rail edge, so each 32px button is centred on the icon column (x = 28) and
 * Settings keeps its place at the bottom left. The footer fades out while
 * the Rail collapses and the other layout fades in.
 */
export function RailFooter({
  isShortcutsOpen,
  onShortcutsOpenChange,
  isThemePickerOpen,
  onToggleThemePicker
}: RailFooterProps): React.JSX.Element {
  const collapsed = useRailCollapsed()
  const settingsView = useSettingsModalView()
  const settingsShortcut = useShortcutLabel('settings')
  const footerRef = useRef<HTMLDivElement>(null)
  // Accessible name of the footer button that holds focus. The footer gets a
  // new node per density (see `key` below), which drops the focused button.
  const focusedLabelRef = useRef<string | null>(null)

  // A density change (the `sidebarToggle` shortcut while a footer button has
  // focus) puts focus back on the same button in the new node. Only when
  // focus fell to the page; focus the user moved elsewhere stays there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `collapsed` is the re-key trigger
  useLayoutEffect(() => {
    const label = focusedLabelRef.current
    if (!label) return
    const active = document.activeElement
    if (active && active !== document.body) return
    footerRef.current
      ?.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(label)}"]`)
      ?.focus()
  }, [collapsed])

  return (
    <div
      ref={footerRef}
      // A new node per density, so the other layout fades in from
      // `@starting-style` instead of jumping from a row to a column.
      key={collapsed ? 'collapsed' : 'expanded'}
      onFocus={(event) => {
        focusedLabelRef.current = event.target.getAttribute('aria-label')
      }}
      onBlur={(event) => {
        const footer = event.currentTarget
        const next = event.relatedTarget
        if (next instanceof Node && footer.contains(next)) return
        // Wait a frame: a blur from the re-key itself (the node left the
        // document) keeps the label; a real move of focus clears it.
        requestAnimationFrame(() => {
          if (footer.isConnected) focusedLabelRef.current = null
        })
      }}
      className={cn(
        'flex shrink-0 items-center',
        collapsed
          ? 'flex-col-reverse items-start gap-1 py-1.5 pl-3'
          : 'gap-0.5 pb-2 pl-3 pr-1.5 pt-1',
        RAIL_BLOCK_FADE_CLASS
      )}
      data-testid="rail-footer"
    >
      <RailButton
        label="Settings"
        shortcut={settingsShortcut}
        size="base"
        aria-label="Settings"
        pressed={settingsView === 'app'}
        onClick={() => useSettingsModalStore.getState().openApp()}
      >
        <SlidersHorizontal size={14} />
      </RailButton>
      <RailButton
        label="Report a bug"
        size="base"
        aria-label="Report a bug"
        onClick={() => useReportBugStore.getState().openReport()}
      >
        <Bug size={14} />
      </RailButton>
      <RailUtilityButtons
        isShortcutsOpen={isShortcutsOpen}
        onShortcutsOpenChange={onShortcutsOpenChange}
        isThemePickerOpen={isThemePickerOpen}
        onToggleThemePicker={onToggleThemePicker}
        size="base"
        className={collapsed ? 'flex-col-reverse gap-1' : 'gap-0.5'}
      />
    </div>
  )
}

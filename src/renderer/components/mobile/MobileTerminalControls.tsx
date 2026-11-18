import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardPaste, Keyboard } from '@/components/icons'
import {
  findEditorInputTarget,
  routeMobileKey
} from '@/components/terminal/command-editor/foreign-insert'
import { Button } from '@/components/ui/button'
import { useDockClearance } from '@/hooks/use-dock-clearance'
import { useOskViewport } from '@/hooks/use-osk-viewport'
import { clipboardApi } from '@/lib/clipboard-api'
import {
  canTerminalWriteToPty,
  resolveLifecycleTerminalId
} from '@/lib/command-lifecycle/input-guard'
import { terminalApi } from '@/lib/terminal-api'
import { cn } from '@/lib/utils'
import { useTerminalStore } from '@/stores/terminal-store'

interface MobileTerminalControlsProps {
  terminalId: string
}

function terminalWriteIds(terminalId: string): { lifecycleId: string; writeId: string } {
  const store = useTerminalStore.getState()
  const byId = store.terminals.find((terminal) => terminal.id === terminalId)
  if (byId) return { lifecycleId: byId.id, writeId: byId.ptyId ?? byId.id }
  const byPty = store.findTerminalByPtyId(terminalId)
  if (byPty) return { lifecycleId: byPty.id, writeId: byPty.ptyId ?? terminalId }
  return { lifecycleId: resolveLifecycleTerminalId(terminalId) ?? terminalId, writeId: terminalId }
}

// [visible label, escape sequence, spoken name]. Speech engines misread the
// bare glyphs ("leftwards arrow", "P G up"), so each key's accessible name is
// a spoken form. Text keys keep their visible label at the start of the name
// (WCAG 2.5.3); the three arrow keys are symbols, not text, so they get plain
// word names instead.
const KEYS = [
  ['Esc', '\u001b', 'Esc, escape'],
  ['Tab', '\t', 'Tab'],
  ['Ctrl+C', '\u0003', 'Ctrl+C, interrupt'],
  ['←', '\u001b[D', 'Left arrow'],
  ['↑', '\u001b[A', 'Up arrow'],
  ['↓', '\u001b[B', 'Down arrow'],
  ['→', '\u001b[C', 'Right arrow'],
  ['PgUp', '\u001b[5~', 'PgUp, page up'],
  ['PgDn', '\u001b[6~', 'PgDn, page down']
] as const

export function MobileTerminalControls({
  terminalId
}: MobileTerminalControlsProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const pasteGeneration = useRef(0)
  // Cleanup runs when terminalId changes and on unmount, invalidating in-flight pastes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: terminalId is the invalidation trigger, not a value the effect reads.
  useEffect(
    () => () => {
      pasteGeneration.current += 1
    },
    [terminalId]
  )
  const keyLaneId = useId()
  const laneRef = useRef<HTMLDivElement>(null)
  // True when the lane shows its last key (or does not scroll at all), so the
  // end fade only shows while more keys are off-screen.
  const [laneAtEnd, setLaneAtEnd] = useState(true)
  const updateLaneEnd = useCallback(() => {
    const lane = laneRef.current
    if (!lane) return
    setLaneAtEnd(lane.scrollLeft + lane.clientWidth >= lane.scrollWidth - 1)
  }, [])
  // Re-check when the lane is shown again or the viewport turns.
  useEffect(() => {
    if (!expanded) return
    updateLaneEnd()
    window.addEventListener('resize', updateLaneEnd)
    return () => window.removeEventListener('resize', updateLaneEnd)
  }, [expanded, updateLaneEnd])
  // The bar exists only on the mobile shell. It reports its top edge so a toast
  // clears the whole bar (`useDockClearance`).
  const barRef = useDockClearance(true)
  const osk = useOskViewport()

  const write = async (data: string): Promise<void> => {
    const { lifecycleId, writeId } = terminalWriteIds(terminalId)
    const target = findEditorInputTarget(terminalId)
    if (target) {
      await routeMobileKey(target, 'key', data, async (text) => {
        const result = await terminalApi.write(writeId, text)
        if (!result.success) toast.error(`Terminal write failed: ${result.error}`)
      })
      return
    }
    if (!canTerminalWriteToPty(lifecycleId, data)) return
    const result = await terminalApi.write(writeId, data)
    if (!result.success) {
      toast.error(`Terminal write failed: ${result.error}`)
    }
  }

  const paste = async (): Promise<void> => {
    const generation = pasteGeneration.current
    const result = await clipboardApi.readText()
    if (pasteGeneration.current !== generation) return
    if (!result.success) {
      toast.error(`Clipboard read failed: ${result.error}`)
      return
    }
    if (result.data) {
      const { lifecycleId, writeId } = terminalWriteIds(terminalId)
      const target = findEditorInputTarget(terminalId)
      if (target) {
        await routeMobileKey(target, 'paste', result.data, async (text) => {
          const writeResult = await terminalApi.write(writeId, text)
          if (!writeResult.success) toast.error(`Paste failed: ${writeResult.error}`)
        })
        return
      }
      if (!canTerminalWriteToPty(lifecycleId, result.data)) return
      const writeResult = await terminalApi.write(writeId, result.data)
      if (!writeResult.success) {
        toast.error(`Paste failed: ${writeResult.error}`)
      }
    }
  }

  // While the on-screen keyboard is up it covers the home indicator, so the bar
  // drops the safe-area padding. On iOS the layout viewport does not shrink
  // for the keyboard: the bar is lifted by the keyboard height (the same
  // `--termul-keyboard-height` spacer the chat composer uses). On Android with
  // `resizes-content` that height is ~0, so nothing is added twice.
  const keyboardLift = osk.isOskOpen && osk.keyboardHeight > 0

  return (
    <div
      ref={barRef}
      className={cn(
        // 52px row: 44px controls with 4px above and below (Paper 10.6a). The
        // lane carries 2px of that itself, so its key shadows are not clipped
        // by its own scroll box.
        'shrink-0 border-t-[0.5px] border-border bg-card pt-0.5',
        // Side padding grows to the notch inset on a landscape phone.
        'pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]',
        osk.isOskOpen ? 'pb-0.5' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      )}
      style={
        keyboardLift
          ? {
              paddingBottom: `calc(0.25rem + var(--termul-keyboard-height, ${osk.keyboardHeight}px))`
            }
          : undefined
      }
    >
      {/* One row that scrolls sideways (Paper 10.6a), so the terminal keeps
          more lines above the on-screen keyboard. The toggle and Paste stay
          fixed at the start; the nine keys scroll in their own lane, which
          fades at its end while more keys are off-screen. Pointer-down is
          prevented on every button so xterm keeps focus and the on-screen
          keyboard stays up; click still fires. */}
      {/* biome-ignore lint/a11y/useSemanticElements: this is a labelled shortcut-key group, not a form fieldset */}
      <div role="group" aria-label="Terminal keys" className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 min-w-11 shrink-0 px-3"
          aria-label="Show/hide key bar"
          aria-expanded={expanded}
          aria-controls={keyLaneId}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setExpanded((value) => !value)}
        >
          <Keyboard size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 min-w-11 shrink-0 gap-1 px-3"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void paste()}
        >
          <ClipboardPaste size={15} />
          Paste
        </Button>
        <span aria-hidden="true" className="h-6 w-[0.5px] shrink-0 bg-border" />
        <div
          ref={laneRef}
          id={keyLaneId}
          data-key-lane=""
          onScroll={updateLaneEnd}
          className={cn(
            'flex min-w-0 flex-1 snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain touch-pan-x py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            // 24px end fade while more keys sit past the edge.
            !laneAtEnd &&
              '[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]',
            !expanded && 'hidden'
          )}
        >
          {KEYS.map(([label, data, name]) => (
            <Button
              key={label}
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 min-w-11 shrink-0 snap-start px-3 font-mono"
              aria-label={name}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void write(data)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

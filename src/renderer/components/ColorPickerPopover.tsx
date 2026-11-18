import { useEffect, useRef } from 'react'
import { TOUCH_HIT_AREA_CLASS } from '@/components/phone-modal-classes'
import { availableColors, getColorClasses } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { ProjectColor } from '@/types/project'

interface ColorPickerPopoverProps {
  x: number
  y: number
  currentColor: ProjectColor
  onSelectColor: (color: ProjectColor) => void
  onClose: () => void
}

export function ColorPickerPopover({
  x,
  y,
  currentColor,
  onSelectColor,
  onClose
}: ColorPickerPopoverProps): React.JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Adjust position if popover would overflow viewport
  const adjustedPosition = (): { left: number; top: number } => {
    const popoverWidth = 200
    const popoverHeight = 80
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = x
    let top = y

    if (x + popoverWidth > viewportWidth) {
      left = viewportWidth - popoverWidth - 8
    }
    if (y + popoverHeight > viewportHeight) {
      top = viewportHeight - popoverHeight - 8
    }

    return { left, top }
  }

  const position = adjustedPosition()

  // Close on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    document.addEventListener('keydown', handleEscape)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-3"
      style={{ left: position.left, top: position.top }}
    >
      <p className="text-xs text-muted-foreground mb-2">Select Color</p>
      {/* Touch: 20px gaps so the 44px hit areas round the 24px swatches do not overlap. */}
      <div className="flex gap-2 pointer-coarse:gap-5 pointer-coarse:p-2.5 flex-wrap">
        {availableColors.map((color) => {
          const colors = getColorClasses(color)
          return (
            <button
              type="button"
              key={color}
              onClick={() => {
                onSelectColor(color)
                onClose()
              }}
              className={cn(
                'w-6 h-6 rounded-full transition-[opacity,box-shadow]',
                TOUCH_HIT_AREA_CLASS,
                colors.bg,
                currentColor === color
                  ? 'ring-2 ring-offset-2 ring-offset-card ring-current'
                  : 'hover:opacity-80'
              )}
            />
          )
        })}
      </div>
    </div>
  )
}

import * as SelectPrimitive from '@radix-ui/react-select'
import { forwardRef } from 'react'
import { Check } from '@/components/icons'
import { MENU_INDICATOR_CLASS, MENU_ITEM_CLASS } from '@/components/ui/menu-styles'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SettingsSelectOption {
  /** Radix needs a non-empty string; map `null` to a sentinel such as `'none'`. */
  value: string
  label: string
  /** Shown under the label in the open menu only. */
  description?: string
}

interface SettingsSelectProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Select>, 'children'> {
  options: readonly SettingsSelectOption[]
  id?: string
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

/**
 * A `ui/select` sized for a settings row: full width under the label when
 * the card is narrow, 240px beside it otherwise. Works controlled
 * (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 */
export const SettingsSelect = forwardRef<HTMLButtonElement, SettingsSelectProps>(
  function SettingsSelect(
    {
      options,
      id,
      className,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) {
    return (
      <Select {...props}>
        <SelectTrigger
          ref={ref}
          id={id}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          className={cn('h-8 w-full text-xs pointer-coarse:h-11 @[35rem]:w-60', className)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectPrimitive.Item
              key={option.value}
              value={option.value}
              className={cn(MENU_ITEM_CLASS, 'w-full flex-col items-start pl-8')}
            >
              <span className={MENU_INDICATOR_CLASS}>
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
              </span>
              <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              {option.description && (
                <span className="text-xs text-muted-foreground">{option.description}</span>
              )}
            </SelectPrimitive.Item>
          ))}
        </SelectContent>
      </Select>
    )
  }
)

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * The press of a main button (primary, secondary, outline, destructive): a
 * light .97 squeeze on the strong ease-out, back on release. Nothing else in
 * the app scales on press: rows, menu items, chips, tabs and icon buttons
 * answer with their fill.
 */
const PRESS =
  'active:scale-[0.97] motion-reduce:active:scale-100 transition-[scale,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]'

/**
 * Filled primary chrome for `default` and `composer`.
 * Per-theme emboss and hover/pressed fills (component-tokens.ts), muted
 * disabled fill.
 * Send, stop, and launch use `composer`. Other primary actions use `default`.
 * One filled primary per view. The glyph is the only difference at the call site.
 */
const primaryEmboss = `bg-primary-fill text-primary-foreground ${PRESS} hover:bg-primary-fill-hover active:bg-primary-fill-active disabled:bg-muted disabled:text-disabled-foreground disabled:opacity-100 disabled:hover:bg-muted disabled:shadow-none shadow-emboss hover:shadow-emboss-hover`

/**
 * Secondary chrome for `secondary` and `outline`: a raised control one step
 * above its surface, a 0.5px edge and a tight drop (light: white, a 1px ink
 * ring and a soft drop). Per-theme values in component-tokens.ts.
 */
const secondaryControl = `bg-control-fill text-foreground shadow-control hover:bg-control-fill-hover ${PRESS} disabled:opacity-60`

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: primaryEmboss,
        destructive: `bg-destructive-fill text-destructive-foreground hover:bg-destructive-fill/90 ${PRESS}`,
        outline: secondaryControl,
        secondary: secondaryControl,
        ghost: 'hover:bg-secondary hover:text-ghost-hover-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        composer: primaryEmboss
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: 'h-7 rounded-md px-2 text-xs',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
        'icon-xs': 'h-6 w-6 rounded-md',
        'icon-sm': 'h-8 w-8 rounded-lg',
        'icon-lg': 'h-10 w-10',
        // 44px visual floor for mobile paths. `relative` anchors the
        // ::after hit-slop overlay (−inset-1.5 → ~48×48 tappable) without
        // growing layout chrome — same idiom as AttachFilesButton.
        touch: "h-11 relative after:absolute after:-inset-1.5 after:content-['']"
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }

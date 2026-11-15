import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Custom font sizes from tailwind.config.ts that are not t-shirt sizes:
// without this, `text-hero` reads as a text colour and `cn` drops it beside
// `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['hero'] }] } }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

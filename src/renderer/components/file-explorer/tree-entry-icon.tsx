import { cn } from '@/lib/utils'
import { MaterialFileIcon } from './MaterialFileIcon'

/**
 * Material Icon Theme icon of a file tree row (14px), the same icon set as
 * the editor tabs and the chat's changed files. Folders show their open icon
 * while expanded; `depth` 0 picks the root-folder icons.
 */
export function TreeEntryIcon({
  name,
  isDirectory,
  isExpanded = false,
  depth = 0,
  className
}: {
  name: string
  isDirectory: boolean
  isExpanded?: boolean
  depth?: number
  className?: string
}): React.JSX.Element {
  return (
    <span data-testid="tree-entry-icon" className={cn('inline-flex shrink-0', className)}>
      <MaterialFileIcon
        name={name}
        isDirectory={isDirectory}
        isExpanded={isExpanded}
        depth={depth}
        size={14}
      />
    </span>
  )
}

import { File, Folder } from '@/components/icons'
import { cn } from '@/lib/utils'
import { treeFileIconTone } from './tree-entry-tone'

/** Outline folder or file icon of a file tree row (14px). */
export function TreeEntryIcon({
  name,
  isDirectory,
  className
}: {
  name: string
  isDirectory: boolean
  className?: string
}): React.JSX.Element {
  const Icon = isDirectory ? Folder : File
  return (
    <Icon
      size={14}
      data-testid="tree-entry-icon"
      className={cn(
        'shrink-0',
        isDirectory ? 'text-muted-foreground' : treeFileIconTone(name),
        className
      )}
    />
  )
}

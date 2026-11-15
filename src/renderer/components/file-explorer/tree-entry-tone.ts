/**
 * File-type tint of the outline file icon (Paper 3.2 "File tree"). Files of
 * other types and all folders stay muted.
 */
const FILE_TONE_BY_EXTENSION: Record<string, string> = {
  css: 'text-project-purple',
  ts: 'text-project-blue',
  tsx: 'text-project-blue',
  md: 'text-connection',
  json: 'text-project-yellow'
}

/** Tint class of a tree file icon. */
export function treeFileIconTone(name: string): string {
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  return FILE_TONE_BY_EXTENSION[extension] ?? 'text-muted-foreground'
}

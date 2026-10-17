/**
 * An editor file "needs attention" when closing it could lose user text: it has
 * unsaved edits, or an unresolved draft-vs-disk conflict (the draft is only
 * kept in `draftConflict` until the user picks a side). Close prompts, the
 * dirty indicator and the app-close count all use this one predicate so a
 * conflicted file can never be closed silently.
 */
export function fileNeedsAttention(
  file: { isDirty: boolean; draftConflict?: unknown } | undefined
): boolean {
  return file !== undefined && (file.isDirty || file.draftConflict !== undefined)
}

import { forwardRef, type RefObject } from 'react'
import { File, Folder } from '@/components/icons'
import { ComposerMenu, type ComposerMenuItem, type ComposerMenuSection } from './composer-menu'
import type { MentionMatch, MentionSection } from './mention-menu-model'

/** Default empty-state copy; the picker lists files and folders (gh-896). */
export const MENTION_EMPTY_LABEL = 'No files or folders match. Try another name.'
/** Loading-state copy shown while a filename-search stream is in flight. */
export const MENTION_SEARCHING_LABEL = 'Searching files and folders…'

export type FileMentionMenuHandle = {
  move: (delta: 1 | -1) => void
  selectHighlighted: () => boolean
}

interface FileMentionMenuProps {
  sections: MentionSection[]
  onSelect: (match: MentionMatch) => void
  /** Override the empty-state label (e.g. {@link MENTION_SEARCHING_LABEL} while walking). */
  emptyLabel?: string
  /** The composer textarea that owns this listbox (for aria-controls/activedescendant). */
  inputRef?: RefObject<HTMLElement | null>
}

/**
 * Inline @-file mention picker rendered above the chat composer. A thin
 * wrapper over the shared {@link ComposerMenu} shell; the mention-specific
 * part is the MentionItem → ComposerMenuItem mapping (file/folder icon, dimmed
 * ignored entries). See ADR 0003.
 */
export const FileMentionMenu = forwardRef<FileMentionMenuHandle, FileMentionMenuProps>(
  ({ sections, onSelect, emptyLabel, inputRef }, ref) => {
    const composerSections: ComposerMenuSection[] = sections.map((s) => ({
      id: s.id,
      heading: s.heading,
      items: s.items.map<ComposerMenuItem>((item) => ({
        key: item.key,
        label: item.label,
        description: item.description,
        icon: item.kind === 'dir' ? Folder : File,
        dimmed: item.ignored,
        payload: item.payload
      }))
    }))

    return (
      <ComposerMenu
        ref={ref}
        sections={composerSections}
        emptyLabel={emptyLabel ?? MENTION_EMPTY_LABEL}
        inputRef={inputRef}
        onSelect={(_sectionId, cItem) => onSelect(cItem.payload as MentionMatch)}
      />
    )
  }
)

FileMentionMenu.displayName = 'FileMentionMenu'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileMentionMenu } from './FileMentionMenu'
import { buildMentionSections, type MentionMatch } from './mention-menu-model'

const match = (relPath: string, ignored = false): MentionMatch => ({
  relPath,
  absPath: `/root/${relPath}`,
  name: relPath.split('/').pop() ?? relPath,
  ignored
})

describe('FileMentionMenu', () => {
  it('dims ignored rows and fires onSelect with the MentionMatch payload', () => {
    const sections = buildMentionSections({
      matches: [match('src/auth.ts', false), match('node_modules/pkg/index.js', true)],
      recents: [],
      filter: 'a'
    })
    const onSelect = vi.fn()
    render(<FileMentionMenu sections={sections} onSelect={onSelect} />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[1].className).toContain('text-disabled-foreground')
    expect(options[0].className).not.toContain('text-disabled-foreground')

    fireEvent.click(options[0])
    expect(onSelect).toHaveBeenCalledWith(match('src/auth.ts', false))
  })

  it('renders folder rows with a Folder icon in a Folders section after Files', () => {
    const sections = buildMentionSections({
      matches: [
        {
          ...match('src/renderer/components', false),
          absPath: '/root/src/renderer/components/',
          kind: 'dir'
        },
        match('src/components.ts')
      ],
      recents: [],
      filter: 'components'
    })
    const onSelect = vi.fn()
    render(<FileMentionMenu sections={sections} onSelect={onSelect} />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Folders')).toBeInTheDocument()
    // File row first, folder row second (Files section precedes Folders).
    expect(options[0]).toHaveTextContent('components.ts')
    expect(options[1]).toHaveTextContent('src/renderer/components')
    expect(options[0].querySelector('[data-termul-icon="File"]')).not.toBeNull()
    expect(options[0].querySelector('[data-termul-icon="Folder"]')).toBeNull()
    expect(options[1].querySelector('[data-termul-icon="Folder"]')).not.toBeNull()

    fireEvent.click(options[1])
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dir', relPath: 'src/renderer/components' })
    )
  })

  it('renders the empty label when there are no sections', () => {
    const onSelect = vi.fn()
    render(<FileMentionMenu sections={[]} onSelect={onSelect} />)
    expect(screen.getByText('No files or folders match. Try another name.')).toBeInTheDocument()
  })
})

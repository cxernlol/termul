import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Project } from '@/types/project'
import { ProjectItem, type ProjectItemProps } from './project-item'

const project = { id: 'p1', name: 'Alpha', path: '/repo', color: 'blue' } as Project

function renderItem(props: Partial<ProjectItemProps> = {}) {
  const onClick = vi.fn()
  const onToggleChats = vi.fn()
  const onNewChat = vi.fn()
  render(
    <TooltipProvider>
      <ProjectItem
        project={project}
        isActive
        isEditing={false}
        editName=""
        status={{} as ProjectItemProps['status']}
        onOpenNeedsYou={vi.fn()}
        onClick={onClick}
        onNewChat={onNewChat}
        onContextMenu={vi.fn()}
        onEditNameChange={vi.fn()}
        onSaveRename={vi.fn()}
        onCancelRename={vi.fn()}
        onSettingsClick={vi.fn()}
        onToggleChats={onToggleChats}
        chatsListId="rail-chats-p1"
        {...props}
      />
    </TooltipProvider>
  )
  return { onClick, onToggleChats, onNewChat }
}

describe('ProjectItem chat list chevron', () => {
  it('swaps the icon for a chevron on hover or focus and names what it does', () => {
    renderItem()
    const toggle = screen.getByRole('button', { name: 'Hide chats in Alpha' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'rail-chats-p1')
    expect(toggle).toHaveClass('invisible', 'group-hover:visible', 'group-focus-within:visible')
    expect(toggle.querySelector('svg')).toHaveClass('rotate-90', 'motion-reduce:transition-none')
  })

  it('toggles without opening the project', () => {
    const { onClick, onToggleChats } = renderItem()
    fireEvent.click(screen.getByTestId('project-chats-toggle'))
    expect(onToggleChats).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('reads "Show chats" while the list is collapsed', () => {
    renderItem({ chatsExpanded: false })
    const toggle = screen.getByRole('button', { name: 'Show chats in Alpha' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.querySelector('svg')).not.toHaveClass('rotate-90')
    expect(toggle).not.toHaveAttribute('aria-controls')
  })

  it('has no chevron without a chat list', () => {
    renderItem({ onToggleChats: undefined })
    expect(screen.queryByTestId('project-chats-toggle')).not.toBeInTheDocument()
  })
})

describe('ProjectItem new chat button', () => {
  it('shows "+" on the row, and it starts a chat without opening the row', () => {
    const { onClick, onNewChat } = renderItem()
    fireEvent.click(screen.getByRole('button', { name: 'New chat in Alpha' }))
    expect(onNewChat).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('has no "+" while renaming', () => {
    renderItem({ isEditing: true })
    expect(screen.queryByTestId('project-row-new-chat')).not.toBeInTheDocument()
  })
})

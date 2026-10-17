import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { DEFAULT_APP_SETTINGS } from '@/types/settings'
import { TerminalProfilesSection } from './terminal-profiles-section'

const writeDebounced = vi.hoisted(() => vi.fn(async () => ({ success: true, data: undefined })))
vi.mock('@/lib/api', () => ({ persistenceApi: { writeDebounced } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const shells = {
  default: null,
  available: [{ path: '/bin/zsh', name: 'zsh', displayName: 'Zsh' }]
}

describe('TerminalProfilesSection', () => {
  beforeEach(() => {
    writeDebounced.mockClear()
    useAppSettingsStore.setState({ settings: DEFAULT_APP_SETTINGS, isLoaded: true })
  })

  it('refuses an invalid env key, then saves the corrected profile', async () => {
    render(<TerminalProfilesSection availableShells={shells} />)

    fireEvent.click(screen.getByRole('button', { name: /Add profile/ }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Node dev' } })
    fireEvent.change(screen.getByLabelText('Start folder'), { target: { value: '/work/app' } })
    fireEvent.change(screen.getByLabelText('Environment variables'), {
      target: { value: 'BAD-KEY=1' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert').textContent).toBe(
      'Line 1: write KEY=value. A key starts with a letter or _ and holds only letters, digits and _.'
    )
    expect(writeDebounced).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Environment variables'), {
      target: { value: 'NODE_ENV=development' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const [saved] = useAppSettingsStore.getState().settings.terminalProfiles
    expect(saved).toEqual({
      id: expect.any(String),
      name: 'Node dev',
      shell: '',
      args: [],
      cwd: '/work/app',
      env: { NODE_ENV: 'development' }
    })
    expect(screen.getByText('Node dev')).toBeInTheDocument()
  })

  it('edits a shell that shell detection does not list as a typed path', async () => {
    useAppSettingsStore.setState({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        terminalProfiles: [{ id: 'p1', name: 'Nu', shell: 'nu', args: [], cwd: '', env: {} }]
      },
      isLoaded: true
    })
    render(<TerminalProfilesSection availableShells={shells} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Nu' }))
    fireEvent.change(screen.getByLabelText('Shell path or name'), {
      target: { value: 'C:\\tools\\nu.exe' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(useAppSettingsStore.getState().settings.terminalProfiles).toEqual([
      { id: 'p1', name: 'Nu', shell: 'C:\\tools\\nu.exe', args: [], cwd: '', env: {} }
    ])
  })

  it('deletes a profile from the list', () => {
    useAppSettingsStore.setState({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        terminalProfiles: [
          { id: 'p1', name: 'Zsh login', shell: '/bin/zsh', args: ['-l'], cwd: '', env: {} }
        ]
      },
      isLoaded: true
    })
    render(<TerminalProfilesSection availableShells={shells} />)

    expect(screen.getByText('/bin/zsh -l')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Zsh login' }))

    expect(useAppSettingsStore.getState().settings.terminalProfiles).toEqual([])
    expect(screen.getByText('No terminal profiles')).toBeInTheDocument()
  })
})

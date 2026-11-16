import type { McpConsentView, McpInstallForm } from '@shared/types/mcp-install.types'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingMcpInstall } from '@/lib/mcp-install-request'

const { answer, dismiss, connect, logFrontendError } = vi.hoisted(() => ({
  answer: vi.fn(async () => {}),
  dismiss: vi.fn(),
  connect: vi.fn(async () => true),
  logFrontendError: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError }))
vi.mock('@/stores/acp-store', () => ({
  useAcpStore: (sel: (s: unknown) => unknown) =>
    sel({ answerMcpInstall: answer, dismissMcpInstall: dismiss, connectMcpOAuth: connect })
}))

import { McpInstallCard } from './McpInstallCard'

const SECRET = 'super-secret-token-1861'

const form: McpInstallForm = {
  source: { kind: 'catalog', name: 'com.example/keys', version: '1.0.0' },
  choice: null,
  title: 'Keys',
  fields: [
    {
      id: 'header/Authorization/token',
      label: 'token',
      target: { kind: 'header', name: 'Authorization' },
      variable: 'token',
      isRequired: true,
      isSecret: true,
      format: 'string',
      choices: null,
      default: null,
      placeholder: null,
      description: 'API token'
    }
  ]
}

const consent: McpConsentView = {
  transport: 'http',
  command: null,
  argv: [],
  url: 'https://example.com/mcp',
  env: [],
  headers: [
    {
      name: 'Authorization',
      value: 'Bearer {token}',
      isSecret: true,
      origin: 'registry'
    }
  ],
  hostMounts: [],
  warnings: ['sends-data-remote'],
  provenance: null
}

function install(overrides: Partial<PendingMcpInstall> = {}): PendingMcpInstall {
  return {
    requestId: 'mcp-1',
    agentId: 'agent-1',
    sessionId: 'sess-1',
    name: 'keys',
    title: 'Keys',
    transport: 'http',
    form,
    consent,
    planId: 'plan-1',
    launchDigest: 'sha256:abc',
    error: null,
    saving: false,
    result: null,
    ...overrides
  }
}

describe('McpInstallCard', () => {
  beforeEach(() => {
    answer.mockReset().mockResolvedValue(undefined)
    dismiss.mockReset()
    connect.mockReset().mockResolvedValue(true)
    logFrontendError.mockReset()
  })

  it('shows the server, the URL, and the secret field', () => {
    render(<McpInstallCard install={install()} projectId="project-1" />)
    expect(screen.getByRole('heading', { name: 'keys' })).toBeInTheDocument()
    expect(screen.getByText('https://example.com/mcp')).toBeInTheDocument()
    expect(screen.getByLabelText(/token/)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  })

  it('shows an imported environment variable such as NODE_OPTIONS', () => {
    render(
      <McpInstallCard
        projectId={null}
        install={install({
          name: 'echo',
          title: 'echo',
          transport: 'stdio',
          consent: {
            transport: 'stdio',
            command: 'node',
            argv: ['node', 'server.js'],
            url: null,
            env: [
              {
                name: 'NODE_OPTIONS',
                value: '--experimental-vm-modules',
                isSecret: false,
                origin: 'file'
              }
            ],
            headers: [],
            hostMounts: [],
            warnings: [],
            provenance: null
          }
        })}
      />
    )
    expect(screen.getByRole('heading', { name: 'echo' })).toBeInTheDocument()
    expect(screen.getByText('NODE_OPTIONS')).toBeInTheDocument()
    expect(screen.getByText('--experimental-vm-modules')).toBeInTheDocument()
    expect(screen.getByText(/Launch digest sha256:abc/)).toBeInTheDocument()
  })

  it('shows the command and arguments for a local server', () => {
    render(
      <McpInstallCard
        projectId={null}
        install={install({
          transport: 'stdio',
          consent: {
            ...consent,
            transport: 'stdio',
            command: 'npx',
            argv: ['npx', '-y', 'pkg-mcp'],
            url: null
          }
        })}
      />
    )
    expect(screen.getAllByText('npx').length).toBeGreaterThan(0)
    expect(screen.getByText('-y')).toBeInTheDocument()
    expect(screen.getByText('pkg-mcp')).toBeInTheDocument()
  })

  it('asks for a review when the command is not known yet', () => {
    render(
      <McpInstallCard install={install({ consent: null, launchDigest: null })} projectId={null} />
    )
    expect(screen.getByRole('button', { name: 'Review command' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
  })

  it('decline installs nothing and does not send the secret', () => {
    render(<McpInstallCard install={install()} projectId="project-1" />)
    fireEvent.change(screen.getByLabelText(/token/), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(answer).toHaveBeenCalledWith('mcp-1', 'decline', {}, undefined, null, null)
    expect(JSON.stringify(answer.mock.calls)).not.toContain(SECRET)
  })

  it('approve sends the secret only as a secret value', () => {
    render(<McpInstallCard install={install()} projectId="project-1" />)
    fireEvent.change(screen.getByLabelText(/token/), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(answer).toHaveBeenCalledWith(
      'mcp-1',
      'approve',
      {},
      { 'header/Authorization/token': SECRET },
      'plan-1',
      'sha256:abc'
    )
    expect(logFrontendError).not.toHaveBeenCalled()
  })

  it('shows the next steps and offers sign-in after install', () => {
    render(
      <McpInstallCard
        projectId="project-1"
        install={install({
          result: {
            outcome: 'installed',
            name: 'keys',
            serverId: 'srv-1',
            oauth: true,
            nextSteps: [
              { kind: 'oauth', message: 'Sign in to this server.' },
              {
                kind: 'new_session',
                message: 'Start a new chat so this agent can use the new tools.'
              }
            ]
          }
        })}
      />
    )
    expect(screen.getByText('Sign in to this server.')).toBeInTheDocument()
    expect(screen.getByText(/Start a new chat/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(connect).toHaveBeenCalledWith('project-1', 'srv-1')
    expect(screen.queryByDisplayValue(SECRET)).not.toBeInTheDocument()
  })
})

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentCapabilities } from '@/lib/acp-api'
import { CapabilitySummary } from './SelectorRows'

afterEach(() => cleanup())

function renderSummary(capabilities: AgentCapabilities | null | undefined): void {
  render(<CapabilitySummary capabilities={capabilities} touch={false} />)
}

function rowText(label: string): string | null | undefined {
  const row = screen.getByText(label).closest('div')
  return row ? within(row).getByRole('definition').textContent : undefined
}

describe('CapabilitySummary', () => {
  it('lists the prompt content and MCP transports the agent advertises', () => {
    renderSummary({
      promptCapabilities: { image: true, audio: false, embeddedContext: true },
      mcpCapabilities: { http: true, sse: false }
    })

    expect(rowText('Accepts')).toBe('Text · Images · Embedded context')
    expect(rowText('MCP servers')).toBe('stdio · HTTP')
  })

  it('lists SSE and audio when the agent advertises them', () => {
    renderSummary({
      promptCapabilities: { audio: true },
      mcpCapabilities: { http: true, sse: true }
    })

    expect(rowText('Accepts')).toBe('Text · Audio (cannot attach yet)')
    expect(rowText('MCP servers')).toBe('stdio · HTTP · SSE')
  })

  it('names the baseline when the agent advertises nothing beyond it', () => {
    renderSummary({
      promptCapabilities: { image: false, audio: false, embeddedContext: false },
      mcpCapabilities: { http: false, sse: false }
    })

    expect(rowText('Accepts')).toBe('Text only')
    expect(rowText('MCP servers')).toBe('stdio only')
  })

  it('shows only the row the agent advertised', () => {
    renderSummary({ mcpCapabilities: { sse: true } })

    expect(screen.queryByText('Accepts')).toBeNull()
    expect(rowText('MCP servers')).toBe('stdio · SSE')
  })

  it.each([
    ['no capabilities', undefined],
    ['null capabilities', null],
    ['capabilities without either field', { loadSession: true }],
    ['null capability fields', { promptCapabilities: null, mcpCapabilities: null }]
  ] as const)('renders nothing for %s', (_name, capabilities) => {
    const { container } = render(<CapabilitySummary capabilities={capabilities} touch={false} />)

    expect(container).toBeEmptyDOMElement()
  })
})

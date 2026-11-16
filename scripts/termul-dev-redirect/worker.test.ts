import { describe, expect, it } from 'vitest'
import worker, { redirectTarget } from './worker'

describe('termul.dev redirect', () => {
  it.each([
    ['https://termul.dev/', 'https://usetroupe.dev/'],
    ['https://termul.dev/privacy/', 'https://usetroupe.dev/privacy/'],
    ['https://termul.dev/docs/install?x=1', 'https://usetroupe.dev/docs/install?x=1'],
    ['https://docs.termul.dev/', 'https://usetroupe.dev/docs/'],
    ['https://docs.termul.dev/docs', 'https://usetroupe.dev/docs'],
    ['https://docs.termul.dev/docs/remote/server', 'https://usetroupe.dev/docs/remote/server'],
    ['https://docs.termul.dev/llms.txt', 'https://usetroupe.dev/docs/llms.txt'],
    ['https://docs.termul.dev/openapi.yaml', 'https://usetroupe.dev/docs/openapi.yaml'],
    [
      'https://docs.termul.dev/llms.mdx/docs/ssh/connect',
      'https://usetroupe.dev/docs/llms.mdx/ssh/connect'
    ]
  ])('%s -> %s', (from, to) => {
    expect(redirectTarget(from)).toBe(to)
  })

  it('answers with a permanent redirect that keeps the method, so a POST keeps its body', () => {
    const response = worker.fetch(
      new Request('https://termul.dev/api/testimonials', { method: 'POST', body: '{}' })
    )
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://usetroupe.dev/api/testimonials')
  })
})

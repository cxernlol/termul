import { describe, expect, it } from 'vitest'
import { diffTabId, diffTabIdentity } from './diff-tab-identity'

describe('diffTabIdentity', () => {
  it('canonicalizes the working copy and the repo-relative POSIX path', () => {
    expect(diffTabIdentity('E:\\p', 'a\\b.ts', false)).toEqual({
      workingCopy: 'e:/p',
      path: 'a/b.ts',
      staged: false
    })
    expect(diffTabIdentity('e:/p/', './a//b.ts', false)).toEqual(
      diffTabIdentity('E:\\p', 'a\\b.ts', false)
    )
  })

  it('does not case-fold posix paths', () => {
    expect(diffTabIdentity('/Repo', 'A.ts', true).workingCopy).toBe('/Repo')
    expect(diffTabIdentity('/Repo', 'A.ts', true).path).toBe('A.ts')
  })
})

describe('diffTabId', () => {
  it('is the same for every path form of one identity', () => {
    expect(diffTabId('E:\\p', 'a\\b.ts', false)).toBe(diffTabId('e:/p/', 'a/b.ts', false))
  })

  it('is stable and prefixed', () => {
    const id = diffTabId('/repo', 'a.ts', false)
    expect(id).toMatch(/^diff:[0-9a-f]{16}$/)
    expect(diffTabId('/repo', 'a.ts', false)).toBe(id)
  })

  it('differs by side, working copy and path', () => {
    const ids = new Set([
      diffTabId('/repo', 'a.ts', false),
      diffTabId('/repo', 'a.ts', true),
      diffTabId('/repo-wt', 'a.ts', false),
      diffTabId('/repo', 'b.ts', false)
    ])
    expect(ids.size).toBe(4)
  })
})

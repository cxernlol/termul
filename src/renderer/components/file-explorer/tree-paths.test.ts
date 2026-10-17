import type { DirectoryEntry } from '@shared/types/filesystem.types'
import { describe, expect, it } from 'vitest'
import {
  findTreeEntry,
  joinTreePath,
  normalizeTreePath,
  parentTreePath,
  resolveDeleteTargets
} from './tree-paths'

function entry(path: string, type: DirectoryEntry['type'] = 'file'): DirectoryEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    type,
    extension: null,
    size: 0,
    modifiedAt: 0
  }
}

describe('tree-paths', () => {
  it('normalizes separators and drops a trailing slash except on the filesystem root', () => {
    expect(normalizeTreePath('C:\\work\\app\\')).toBe('C:/work/app')
    expect(normalizeTreePath('/project/src/')).toBe('/project/src')
    expect(normalizeTreePath('/')).toBe('/')
  })

  it('returns the parent folder, `/` for a top-level path and empty without a slash', () => {
    expect(parentTreePath('/project/src/app.ts')).toBe('/project/src')
    expect(parentTreePath('C:\\work\\app.ts')).toBe('C:/work')
    expect(parentTreePath('/app.ts')).toBe('/')
    expect(parentTreePath('app.ts')).toBe('')
  })

  it('joins without a double slash under the filesystem root', () => {
    expect(joinTreePath('/project', 'a.ts')).toBe('/project/a.ts')
    expect(joinTreePath('/', 'a.ts')).toBe('/a.ts')
  })

  it('finds a loaded entry in any folder', () => {
    const contents = new Map([
      ['/project', [entry('/project/src', 'directory')]],
      ['/project/src', [entry('/project/src/app.ts')]]
    ])
    expect(findTreeEntry(contents, '/project/src/app.ts')?.name).toBe('app.ts')
    expect(findTreeEntry(contents, '/project/missing.ts')).toBeUndefined()
  })
})

describe('resolveDeleteTargets', () => {
  const dirA = entry('/proj/a', 'directory')
  const one = entry('/proj/a/one.ts')
  const two = entry('/proj/a/two.ts')
  const four = entry('/proj/b/four.ts')
  const contents = new Map([
    ['/proj', [dirA, entry('/proj/b', 'directory')]],
    ['/proj/a', [one, two]],
    ['/proj/b', [four]]
  ])

  it('acts on the whole selection when the clicked entry is part of it', () => {
    const selected = new Set([one.path, four.path])
    expect(resolveDeleteTargets(contents, selected, four)).toEqual([one, four])
  })

  it('acts on the clicked entry alone when it is outside the selection', () => {
    expect(resolveDeleteTargets(contents, new Set([one.path, two.path]), four)).toEqual([four])
  })

  it('acts on the selection when no entry was clicked', () => {
    expect(resolveDeleteTargets(contents, new Set([two.path, four.path]))).toEqual([two, four])
  })

  it('drops an entry whose ancestor folder is also selected', () => {
    const selected = new Set([one.path, dirA.path, four.path])
    expect(resolveDeleteTargets(contents, selected, one)).toEqual([dirA, four])
  })
})

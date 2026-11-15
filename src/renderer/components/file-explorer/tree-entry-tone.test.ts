import { describe, expect, it } from 'vitest'
import { treeFileIconTone } from './tree-entry-tone'

describe('treeFileIconTone', () => {
  it('tints the file types from Paper 3.2', () => {
    expect(treeFileIconTone('globals.css')).toBe('text-project-purple')
    expect(treeFileIconTone('legacy-sizes.ts')).toBe('text-project-blue')
    expect(treeFileIconTone('App.TSX')).toBe('text-project-blue')
    expect(treeFileIconTone('AGENTS.md')).toBe('text-connection')
    expect(treeFileIconTone('package.json')).toBe('text-project-yellow')
  })

  it('keeps other files, dotfiles and names without an extension muted', () => {
    expect(treeFileIconTone('main.rs')).toBe('text-muted-foreground')
    expect(treeFileIconTone('.gitignore')).toBe('text-muted-foreground')
    expect(treeFileIconTone('Makefile')).toBe('text-muted-foreground')
  })
})

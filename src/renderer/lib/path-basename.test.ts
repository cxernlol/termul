import { describe, expect, it } from 'vitest'
import { basename } from './path-basename'

describe('basename', () => {
  it('returns the last segment for either slash style', () => {
    expect(basename('D:\\a\\b\\file.ts')).toBe('file.ts')
    expect(basename('/home/x/file.ts')).toBe('file.ts')
    expect(basename('src\\mixed/dir\\file.ts')).toBe('file.ts')
    expect(basename('plain.txt')).toBe('plain.txt')
  })

  it('returns the input unchanged when it ends in a separator or is empty', () => {
    expect(basename('/home/x/')).toBe('/home/x/')
    expect(basename('C:\\proj\\')).toBe('C:\\proj\\')
    expect(basename('')).toBe('')
  })
})

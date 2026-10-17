import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Source scanning for raw `<input>`, `<textarea>` and `<select>` tags in the
 * renderer, shared by the text-field guard tests in `components/ui/`.
 */

export const NON_TEXT_TYPES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'range',
  'file',
  'hidden',
  'button',
  'submit',
  'reset',
  'image',
  'color'
])

const FIELD_TAG = /^(?:input|textarea|select)(?![\w-])/
const ANY_TAG = /^([A-Za-z][\w.-]*)/

/**
 * True when `<` at `index` opens JSX. In text it always does. In code it does
 * after `return`, `=>`, or a non-identifier, so `useState<string>` is not a tag.
 */
function isJsxOpen(source: string, index: number, inText: boolean): boolean {
  if (inText) return true
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  if (source.slice(lineStart, index).trim() === '') return true
  let cursor = index - 1
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor--
  if (cursor < 0) return true
  const previous = source[cursor]
  if ('({}=&|?:,;[]>'.includes(previous)) return true
  const word = /[A-Za-z]+$/.exec(source.slice(0, cursor + 1))?.[0]
  return word === 'return' || word === 'yield'
}

/**
 * Indexes of raw `<input>`, `<textarea>` and `<select>` tags. Strings, comments
 * and JSX comments are skipped, and an apostrophe in JSX text is not a string,
 * so a later field is still found. Position does not matter.
 */
export function findRawTagStarts(source: string): number[] {
  const starts: number[] = []
  let mode: 'code' | 'tag' | 'text' = 'code'
  let quote: string | null = null
  let cameFrom: 'code' | 'text' = 'code'
  let openName = ''
  let brace = 0
  const elements: Array<{ name: string; resume: 'code' | 'text' }> = []
  const expressions: Array<{ resume: 'tag' | 'text'; depth: number }> = []

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (mode !== 'text' && char === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
      continue
    }
    if (mode !== 'text' && char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (char === '{' && source[i + 1] === '/' && source[i + 2] === '*') {
      const end = source.indexOf('*/', i + 3)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (mode !== 'text' && (char === '"' || char === "'" || char === '`')) {
      quote = char
      continue
    }
    if (char === '{') {
      if (mode === 'text' || mode === 'tag') {
        expressions.push({ resume: mode, depth: brace })
        mode = 'code'
      }
      brace++
      continue
    }
    if (char === '}') {
      brace--
      const expression = expressions[expressions.length - 1]
      if (expression && brace === expression.depth) {
        expressions.pop()
        mode = expression.resume
      }
      continue
    }
    if (char === '<' && mode !== 'tag' && isJsxOpen(source, i, mode === 'text')) {
      if (source[i + 1] === '/') {
        const name = /^\/([A-Za-z][\w.-]*)/.exec(source.slice(i + 1))?.[1]
        const end = source.indexOf('>', i)
        if (end !== -1) i = end
        const open = elements[elements.length - 1]
        if (name && open && open.name === name) {
          elements.pop()
          mode = open.resume
        }
        continue
      }
      const name = ANY_TAG.exec(source.slice(i + 1))?.[1]
      if (!name) continue
      if (FIELD_TAG.test(name)) starts.push(i)
      cameFrom = mode === 'text' ? 'text' : 'code'
      openName = name
      mode = 'tag'
      continue
    }
    if (mode === 'tag' && char === '>') {
      if (source[i - 1] === '/') mode = cameFrom
      else {
        elements.push({ name: openName, resume: cameFrom })
        mode = 'text'
      }
    }
  }
  return starts
}

/** The literal `type` attribute, read outside quotes so a placeholder cannot impersonate it. */
function literalType(tag: string): string | null {
  let quote: string | null = null
  let depth = 0
  for (let i = 0; i < tag.length; i++) {
    const char = tag[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth++
    else if (char === '}') depth--
    else if (depth === 0 && (i === 0 || /\s/.test(tag[i - 1])) && tag.startsWith('type=', i)) {
      const literal = tag.slice(i + 5).match(/^"([^"]*)"|^'([^']*)'|^\{\s*["']([^"']*)["']/)
      return literal ? (literal[1] ?? literal[2] ?? literal[3]) : null
    }
  }
  return null
}

/** Reads one opening tag from its `<` to its closing `>`, skipping `{}` bodies, quotes and comments. */
export function readTag(source: string, start: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      if (end === -1) break
      i = end
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) break
      i = end + 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '{') depth++
    else if (char === '}') depth--
    else if (char === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1)
  }
  return source.slice(start)
}

/** True when the tag has a literal `type` that takes no text, such as a checkbox. */
export function isNonTextTag(tag: string): boolean {
  const type = literalType(tag)
  return type !== null && NON_TEXT_TYPES.has(type)
}

export interface RawFieldTag {
  line: number
  tag: string
}

/** Every raw text-entry tag in `source`, with its 1-based line. Non-text input types are skipped. */
export function findTextFieldTags(source: string): RawFieldTag[] {
  const tags: RawFieldTag[] = []
  for (const start of findRawTagStarts(source)) {
    const tag = readTag(source, start)
    if (isNonTextTag(tag)) continue
    tags.push({ line: source.slice(0, start).split('\n').length, tag })
  }
  return tags
}

/** Non-test source files under `dir` with one of `extensions`, sorted. */
export function listSourceFiles(dir: string, extensions: readonly string[] = ['.tsx']): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files.push(...listSourceFiles(path, extensions))
    else if (
      extensions.some((ext) => name.endsWith(ext)) &&
      !/\.test\.tsx?$/.test(name) &&
      !name.endsWith('.d.ts')
    ) {
      files.push(path)
    }
  }
  return files
}

/** `path` relative to `root`, with forward slashes. */
export function toRootPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

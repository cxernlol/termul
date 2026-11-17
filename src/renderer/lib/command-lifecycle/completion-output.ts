export interface CompletionOutputRow {
  text: string
  from: number
  to: number
  /** Shell spelling that replaces `from..to`, when it differs from `text`. */
  insert?: string
}

/**
 * `$'` is ANSI-C quoting, where a backslash escapes the next character; `$"`
 * is bash locale quoting, which bash dequotes like double quotes.
 */
type Quote = "'" | '"' | "$'" | '$"' | null

// Unquoted characters the shell would split, expand or treat as syntax.
const UNQUOTED_SPECIAL = /[\s'"\\$`&;|<>()*?[!{}]/g
const DOUBLE_QUOTED_SPECIAL = /["\\$`]/g
// `~/`, `~user/`, `~+/`, `~-/`: characters that need no quoting before the slash.
const TILDE_PREFIX = /^~[\w.+-]*\//

export function parseCompletionOutput(
  draft: string,
  cursor: number,
  output: string
): CompletionOutputRow[] {
  const { from, to, quote } = lastWordRange(draft, cursor)
  // A typed unquoted `~` asks the completer for tilde prefixes (`~/`, `~user`).
  const typed = draft.slice(from, to)
  const seen = new Set<string>()
  const rows: CompletionOutputRow[] = []
  for (const raw of output.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (!line) continue
    const text = decodeHexLine(line)
    if (text === null || containsDisallowedControls(text) || seen.has(text)) continue
    seen.add(text)
    const insert = continueTyped(text, quote, typed) ?? quoteCandidate(text, quote, typed)
    rows.push(insert === text ? { text, from, to } : { text, from, to, insert })
  }
  return rows
}

interface WordAtCursor {
  from: number
  /** Quote still open at the cursor. */
  quote: Quote
  /** The cursor sits right after an unquoted backslash, splitting an escape. */
  escaped: boolean
}

/** The word ends at the cursor and starts after unquoted, unescaped whitespace. */
function wordAtCursor(draft: string, point: number): WordAtCursor {
  let from = 0
  let quote: Quote = null
  let escaped = false
  for (let i = 0; i < point; i++) {
    const char = draft[i]
    if (quote === "'") {
      if (char === "'") quote = null
    } else if (quote === "$'") {
      if (char === "'") quote = null
      else if (char === '\\') i += 1
    } else if (char === '\\') {
      escaped = i + 1 >= point
      i += 1
    } else if (quote === '"' || quote === '$"') {
      if (char === '"') quote = null
    } else if (char === '$' && (draft[i + 1] === "'" || draft[i + 1] === '"')) {
      quote = draft[i + 1] === "'" ? "$'" : '$"'
      i += 1
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (/\s/.test(char)) {
      from = i + 1
    }
  }
  return { from, quote, escaped }
}

function lastWordRange(draft: string, cursor: number): { from: number; to: number; quote: Quote } {
  const point = Math.max(0, Math.min(cursor, draft.length))
  const { from, quote } = wordAtCursor(draft, point)
  return { from, to: point, quote }
}

/**
 * True when the shell word at the cursor goes on past it: the next character is
 * not whitespace, or it is whitespace that an open quote or a backslash keeps
 * inside the word. A candidate would replace only the part before the cursor.
 */
export function wordContinuesPastCursor(draft: string, cursor: number): boolean {
  const next = draft[cursor]
  if (next === undefined || cursor < 0) return false
  if (!/\s/.test(next)) return true
  const { quote, escaped } = wordAtCursor(draft, cursor)
  return quote !== null || escaped
}

/**
 * Candidates are raw words (both host scripts unquote what their completers
 * return); spell them for the quoting open at the cursor. A directory keeps its
 * quote open so the path can be continued.
 */
function quoteCandidate(text: string, quote: Quote, typed: string): string {
  const tilde = typed.startsWith('~')
  const close = text.endsWith('/') ? '' : (quote?.slice(-1) ?? '')
  if (quote) {
    // Bash expands a tilde prefix only while it is unquoted, so one the user
    // typed before the quote (`~/"Doc`) stays outside it.
    const prefix = TILDE_PREFIX.exec(text)?.[0] ?? ''
    const home = prefix && typed.startsWith(prefix) ? prefix : ''
    return `${home}${quote}${quoteBody(text.slice(home.length), quote)}${close}`
  }
  // A leading `~` stays a tilde prefix only when the user typed one; a bare
  // `~` candidate is always a file named `~`, never the home directory. zsh
  // expands a leading `=` to a command path (EQUALS); `\=` is plain in bash.
  const leading = text === '~' || !tilde ? /^[#~=]/ : /^[#=]/
  return text.replace(UNQUOTED_SPECIAL, '\\$&').replace(leading, '\\$&')
}

/** What a typed word means to the shell, and how its spelling may go on. */
interface TypedWord {
  /** The word without its quoting, as the host scripts dequote it. */
  value: string
  /** The spelling ends in `$`, which would read the tail as a parameter name. */
  dollar: boolean
  /** The spelling ends in an unquoted backslash that escapes the tail's first character. */
  backslash: boolean
  /** Digits that would extend a short numeric escape ending an open `$'...'`. */
  digits: RegExp | null
}

// Unquoted characters that make the typed word syntax rather than a literal.
// A leading `#` starts a comment and zsh expands a leading `=` (EQUALS).
const UNQUOTED_SYNTAX = /[`&;|<>()*?[!]/
const UNQUOTED_LEADING_SYNTAX = /[#=]/

/**
 * Read the typed word as a literal, or return null when it is not one, or when
 * no tail could follow it verbatim: bash and zsh history-expand a `!` unless a
 * blank, `=` or `(` follows it, and zsh drops a `!"` pair.
 */
function readTypedWord(typed: string): TypedWord | null {
  let value = ''
  let quote: Quote = null
  let dollar = false
  let digits: RegExp | null = null
  let braces = ''
  for (let i = 0; i < typed.length; i++) {
    const char = typed[i]
    const next = typed[i + 1]
    dollar = false
    if (quote === "'") {
      if (char === "'") quote = null
      else value += char
    } else if (quote === '"' || quote === '$"') {
      if (char === '"') quote = null
      else if (char === '`' || char === '!' || (char === '\\' && next === undefined)) return null
      else if (char === '\\' && /[$`"\\]/.test(next)) value += typed[++i]
      else if (char === '$' && next !== undefined) return null
      else {
        dollar = char === '$'
        value += char
      }
    } else if (char === '\\') {
      if (next === undefined) return { value, dollar, backslash: true, digits }
      value += typed[++i]
    } else if (char === '$' && next === "'") {
      const ansi = readAnsiC(typed, i + 2)
      if (!ansi) return null
      value += ansi.value
      digits = ansi.digits
      i = ansi.end
    } else if (char === '$' && next === '"') {
      quote = '$"'
      i += 1
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (UNQUOTED_SYNTAX.test(char) || (i === 0 && UNQUOTED_LEADING_SYNTAX.test(char))) {
      return null
    } else if (char === '$' && next !== undefined) {
      return null
    } else {
      dollar = char === '$'
      if (char === '{' || char === '}') braces += char
      value += char
    }
  }
  // An unescaped `{` and `}` in one word may already be a brace expansion.
  if (braces.includes('{') && braces.includes('}')) return null
  return { value, dollar, backslash: false, digits }
}

interface NumericEscape {
  digit: RegExp
  max: number
  base: number
  /** Encodes a code point as UTF-8; otherwise the value is one byte. */
  unicode: boolean
}

const OCTAL_ESCAPE: NumericEscape = { digit: /[0-7]/, max: 3, base: 8, unicode: false }
const NUMERIC_ESCAPES: Record<string, NumericEscape> = {
  x: { digit: /[0-9a-fA-F]/, max: 2, base: 16, unicode: false },
  u: { digit: /[0-9a-fA-F]/, max: 4, base: 16, unicode: true },
  U: { digit: /[0-9a-fA-F]/, max: 8, base: 16, unicode: true }
}

interface AnsiCText {
  value: string
  /** Index of the closing quote, or of the last character when it is still open. */
  end: number
  digits: RegExp | null
}

/**
 * Decode `$'...'` from `start` (just after the `$'`) as bash does. Null for
 * escapes that are not literal text (`\n`, `\cX`, an unknown `\q` that keeps
 * its backslash) and for bytes that do not decode as UTF-8.
 */
function readAnsiC(typed: string, start: number): AnsiCText | null {
  const encoder = new TextEncoder()
  const bytes: number[] = []
  let digits: RegExp | null = null
  let i = start
  for (; i < typed.length; i++) {
    digits = null
    const char = String.fromCodePoint(typed.codePointAt(i) ?? 0)
    if (char === "'") break
    if (char !== '\\') {
      bytes.push(...encoder.encode(char))
      i += char.length - 1
      continue
    }
    const kind = typed[++i]
    if (kind === undefined) return null
    if (/['"\\?]/.test(kind)) {
      bytes.push(kind.charCodeAt(0))
      continue
    }
    const octal = OCTAL_ESCAPE.digit.test(kind)
    const numeric = octal ? OCTAL_ESCAPE : NUMERIC_ESCAPES[kind]
    if (!numeric) return null
    let number = octal ? kind : ''
    while (number.length < numeric.max && numeric.digit.test(typed[i + 1] ?? ''))
      number += typed[++i]
    if (!number) return null
    const code = Number.parseInt(number, numeric.base)
    if (!numeric.unicode) bytes.push(code & 0xff)
    else if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null
    else bytes.push(...encoder.encode(String.fromCodePoint(code)))
    if (number.length < numeric.max) digits = numeric.digit
  }
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
    return { value, end: Math.min(i, typed.length - 1), digits }
  } catch {
    return null
  }
}

/**
 * Keep the typed spelling verbatim and spell only the untyped tail, so the
 * insert starts with the draft (ghost text, Right Arrow). Null when the typed
 * word cannot be continued that way and must be spelled in full.
 */
function continueTyped(text: string, quote: Quote, typed: string): string | null {
  if (typed === '' || (text === '~' && typed.startsWith('~'))) return null
  const word = readTypedWord(typed)
  if (!word || !text.startsWith(word.value)) return null
  const tail = text.slice(word.value.length)
  if (quote) {
    const close = text.endsWith('/') ? '' : quote.slice(-1)
    // `"a$""b"` keeps the `$` literal in bash and zsh; `$'\41'$'7'` keeps the
    // `7` out of the octal escape.
    const junction =
      word.dollar && tail ? '""' : word.digits?.test(tail[0] ?? '') ? `'${quote}` : ''
    return `${typed}${junction}${quoteBody(tail, quote)}${close}`
  }
  if (word.backslash) {
    return tail ? `${typed}${tail[0]}${tail.slice(1).replace(UNQUOTED_SPECIAL, '\\$&')}` : null
  }
  const spelled = tail.replace(UNQUOTED_SPECIAL, '\\$&')
  // `$\b` is a literal `$` and `b`; a bare `$b` would expand.
  return word.dollar && tail && !spelled.startsWith('\\')
    ? `${typed}\\${spelled}`
    : `${typed}${spelled}`
}

function quoteBody(text: string, quote: Exclude<Quote, null>): string {
  if (quote === "'") return text.replace(/'/g, "'\\''")
  if (quote === "$'") return text.replace(/[\\']/g, '\\$&')
  // History expansion sees `!` inside double quotes, and a backslash before
  // it stays in the word there, so step out of the quotes to escape it.
  return text.replace(DOUBLE_QUOTED_SPECIAL, '\\$&').replace(/!/g, '"\\!"')
}

export function containsDisallowedControls(text: string): boolean {
  if (/\p{Cf}/u.test(text)) return true
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
  }
  return false
}

function decodeHexLine(line: string): string | null {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(line)) return null
  const bytes = new Uint8Array(line.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(line.slice(i * 2, i * 2 + 2), 16)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

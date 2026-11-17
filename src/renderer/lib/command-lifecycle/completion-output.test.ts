import { expect, it } from 'vitest'
import { parseCompletionOutput, wordContinuesPastCursor } from './completion-output'

function hexLine(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

it('completion output becomes rows', () => {
  const draft = 'git sta'
  const output = [hexLine('status'), 'not-hex', hexLine('stash'), hexLine('status')].join('\n')

  const rows = parseCompletionOutput(draft, 7, output)

  expect(rows).toEqual([
    { text: 'status', from: 4, to: 7 },
    { text: 'stash', from: 4, to: 7 }
  ])
  expect(draft).toBe('git sta')

  expect(parseCompletionOutput(draft, 7, '')).toEqual([])
  expect(parseCompletionOutput('git ', 4, hexLine('status'))).toEqual([
    { text: 'status', from: 4, to: 4 }
  ])
})

it('drops completion candidates that contain ESC or CR', () => {
  const draft = 'git sta'
  const output = [
    hexLine('status\x1b[201~'),
    hexLine('stash\rinjected'),
    hexLine('stash'),
    hexLine('status\tok'),
    hexLine('hidden\u200bname'),
    hexLine('bidi\u202ename'),
    hexLine('isolated\u2066name')
  ].join('\n')

  const rows = parseCompletionOutput(draft, 7, output)

  expect(rows.map((row) => row.text)).toEqual(['stash'])
})

it('candidates take the shell spelling of the word being completed (#1879)', () => {
  const output = [hexLine('dir with space/'), hexLine('file one.txt'), hexLine('plain')].join('\n')
  const spell = (draft: string) =>
    parseCompletionOutput(draft, draft.length, output).map((row) => row.insert ?? row.text)

  expect(spell('cat ')).toEqual(['dir\\ with\\ space/', 'file\\ one.txt', 'plain'])
  expect(spell('cat "di')).toEqual(['"dir with space/', '"file one.txt"', '"plain"'])
  expect(spell("cat 'di")).toEqual(["'dir with space/", "'file one.txt'", "'plain'"])
  // The typed `"dir"\ ` stays as typed; candidates it does not start are spelled in full.
  expect(spell('cat "dir"\\ w')).toEqual(['"dir"\\ with\\ space/', 'file\\ one.txt', 'plain'])
  expect(parseCompletionOutput('cat "plain', 10, hexLine('plain'))[0]).toEqual({
    text: 'plain',
    insert: '"plain"',
    from: 4,
    to: 10
  })
})

it('the word being completed may contain quoted or escaped spaces (#1879)', () => {
  const output = hexLine('dir with space')
  expect(parseCompletionOutput('ls dir\\ w', 9, output)[0]).toMatchObject({ from: 3, to: 9 })
  expect(parseCompletionOutput('cd "a b" "dir w', 15, output)[0]).toMatchObject({
    from: 9,
    to: 15
  })
  expect(parseCompletionOutput("ls 'x y' dir", 12, output)[0]).toMatchObject({ from: 9, to: 12 })
})

it('shell syntax in candidates is escaped', () => {
  const rows = parseCompletionOutput(
    'x ',
    2,
    [hexLine("it's"), hexLine('a&b'), hexLine('#tag'), hexLine('--color=auto')].join('\n')
  )
  expect(rows.map((row) => row.insert ?? row.text)).toEqual([
    "it\\'s",
    'a\\&b',
    '\\#tag',
    '--color=auto'
  ])
  const quoted = parseCompletionOutput('x "', 3, [hexLine('a"$b'), hexLine("it's")].join('\n'))
  expect(quoted.map((row) => row.insert)).toEqual(['"a\\"\\$b"', '"it\'s"'])
  const single = parseCompletionOutput("x '", 3, hexLine("it's"))
  expect(single[0]?.insert).toBe("'it'\\''s'")
})

// Both host scripts send raw words (bash compgen; zsh capture unquotes -Q matches).
it('a backslash in a candidate is a literal character and is escaped', () => {
  const rows = parseCompletionOutput(
    'cat ',
    4,
    [hexLine('a\\b.txt'), hexLine('my file\\b.txt'), hexLine('a\\ b')].join('\n')
  )
  expect(rows.map((row) => row.insert)).toEqual(['a\\\\b.txt', 'my\\ file\\\\b.txt', 'a\\\\\\ b'])
  expect(parseCompletionOutput('cat "', 5, hexLine('a\\b.txt'))[0]?.insert).toBe('"a\\\\b.txt"')
})

// Bash history-expands `!` inside double quotes; a backslash there stays literal.
it('a double-quoted candidate breaks out of the quotes for !', () => {
  const spell = (output: string) => parseCompletionOutput('cat "hel', 8, hexLine(output))[0]?.insert
  expect(spell('hello!world.txt')).toBe('"hello"\\!"world.txt"')
  expect(spell('hello!/')).toBe('"hello"\\!"/')
  expect(parseCompletionOutput('cat hel', 7, hexLine('hello!world.txt'))[0]?.insert).toBe(
    'hello\\!world.txt'
  )
  expect(parseCompletionOutput("cat 'hel", 8, hexLine('hello!world.txt'))[0]?.insert).toBe(
    "'hello!world.txt'"
  )
})

it('braces in an unquoted candidate are escaped against brace expansion', () => {
  const rows = parseCompletionOutput(
    'cat ',
    4,
    [hexLine('report{a,b}.txt'), hexLine('{x}')].join('\n')
  )
  expect(rows.map((row) => row.insert)).toEqual(['report\\{a,b\\}.txt', '\\{x\\}'])
})

// A leading `~` is a tilde prefix only when the user is completing one.
it('a literal leading tilde is escaped, a tilde prefix being completed is not', () => {
  const spell = (draft: string, text: string) =>
    parseCompletionOutput(draft, draft.length, hexLine(text))[0]?.insert ?? text
  expect(spell('cat ', '~')).toBe('\\~')
  expect(spell('cat ', '~backup')).toBe('\\~backup')
  expect(spell('cat \\~b', '~backup')).toBe('\\~backup')
  expect(spell('cat ~', '~')).toBe('\\~')
  expect(spell('cat ~', '~backup')).toBe('~backup')
  expect(spell('cd ~/Doc', '~/Documents/')).toBe('~/Documents/')
  expect(spell('cd ~ro', '~root/')).toBe('~root/')
  expect(spell('cat a', 'a~b')).toBe('a~b')
  expect(spell("cat '", '~')).toBe("'~'")
})

// Bash expands a tilde prefix only while it is unquoted.
it('a typed tilde prefix stays outside the quotes', () => {
  const spell = (draft: string, text: string) =>
    parseCompletionOutput(draft, draft.length, hexLine(text))[0]?.insert ?? text
  expect(spell('cat ~/"Doc', '~/Documents/')).toBe('~/"Documents/')
  expect(spell('cat ~/"my f', '~/my file.txt')).toBe('~/"my file.txt"')
  expect(spell('cat ~root/"Doc', '~root/Doc $x')).toBe('~root/"Doc \\$x"')
  expect(spell('cat ~/"Doc', '~/')).toBe('~/"')
  expect(spell("cat ~/'my f", "~/my file's")).toBe("~/'my file'\\''s'")
  expect(spell("cat ~/$'my f", "~/my file's")).toBe("~/$'my file\\'s'")
  // A tilde the user quoted is literal, and the typed spelling is kept.
  expect(spell('cat ~"/Doc', '~/Documents/')).toBe('~"/Documents/')
  expect(spell('cat "~/Doc', '~/Documents/')).toBe('"~/Documents/')
})

// In $'...' a backslash escapes the next character, including a quote.
it('ansi-c quotes keep an escaped quote and the space after it in the word', () => {
  const draft = "cat $'a\\' b'"
  expect(wordContinuesPastCursor(draft, draft.indexOf(' b'))).toBe(true)
  expect(wordContinuesPastCursor("cat $'a' b", 8)).toBe(false)
  expect(wordContinuesPastCursor("cat \\$'a\\' b", 10)).toBe(false)
  const open = "cat $'a\\' b"
  expect(parseCompletionOutput(open, open.length, hexLine("a' bc"))[0]).toEqual({
    text: "a' bc",
    insert: "$'a\\' bc'",
    from: 4,
    to: open.length
  })
  expect(parseCompletionOutput("cat $'d", 7, hexLine('d\\ir/'))[0]?.insert).toBe("$'d\\\\ir/")
})

// Ghost text and Right Arrow only work when the insert starts with the draft.
it('an insert keeps the typed spelling and quotes only the completed tail', () => {
  const spell = (draft: string, text: string) =>
    parseCompletionOutput(draft, draft.length, hexLine(text))[0]?.insert ?? text
  expect(spell('cat "dir"\\ w', 'dir with space/')).toBe('"dir"\\ with\\ space/')
  expect(spell('cat ~"/Doc', '~/Documents/')).toBe('~"/Documents/')
  expect(spell("cat 'a'b", 'ab c')).toBe("'a'b\\ c")
  expect(spell('cat report{', 'report{a,b}.txt')).toBe('report{a,b\\}.txt')
  expect(spell('cat {a,', '{a,b}')).toBe('{a,b\\}')
  expect(spell('cat a#', 'a#b c')).toBe('a#b\\ c')
  expect(spell('cat "a\\$', 'a$b c')).toBe('"a\\$b c"')
  expect(spell("cat $'a\\\\", 'a\\b c')).toBe("$'a\\\\b c'")
  // A trailing `$` would expand the tail as a name, so its first character is escaped.
  expect(spell('cat a$', 'a$b.txt')).toBe('a$\\b.txt')
  expect(spell('cat a$', 'a$&b')).toBe('a$\\&b')
  expect(spell('cat "a$', 'a$b c')).toBe('"a$""b c"')
  // A trailing unquoted backslash already escapes the tail's first character.
  expect(spell('cat a\\', 'a b')).toBe('a\\ b')
})

// These typed spellings cannot be continued verbatim, so the word is respelled.
it('a typed word that the tail would turn into syntax is respelled', () => {
  const spell = (draft: string, text: string) =>
    parseCompletionOutput(draft, draft.length, hexLine(text))[0]?.insert ?? text
  // bash and zsh history-expand `!` before any character but a blank, `=` or `(`.
  expect(spell('cat hello!', 'hello!world.txt')).toBe('hello\\!world.txt')
  expect(spell('cat "hello!', 'hello!world.txt')).toBe('"hello"\\!"world.txt"')
  expect(spell('cat a&', 'a&b')).toBe('a\\&b')
  expect(spell('cat a*', 'a*b')).toBe('a\\*b')
  expect(spell('cat a$b', 'a$bc')).toBe('a\\$bc')
  expect(spell('cat {a}', '{a}b')).toBe('\\{a\\}b')
})

// zsh's EQUALS option expands an unquoted leading `=` to a command path.
it('a literal leading equals sign is escaped', () => {
  const spell = (draft: string, text: string) =>
    parseCompletionOutput(draft, draft.length, hexLine(text))[0]?.insert ?? text
  expect(spell('cat ', '=echo')).toBe('\\=echo')
  expect(spell('cat =ec', '=echo')).toBe('\\=echo')
  expect(spell('cat \\=ec', '=echo')).toBe('\\=echo')
  expect(spell("cat '=ec", '=echo')).toBe("'=echo'")
  expect(spell('cat a', 'a=b')).toBe('a=b')
})

// The typed `$'...'` escapes stay as typed; only the tail is spelled.
it('ansi-c escapes in the typed word are decoded and kept', () => {
  const spell = (draft: string, text: string) =>
    parseCompletionOutput(draft, draft.length, hexLine(text))[0]?.insert ?? text
  expect(spell("cat $'dir\\x20w", 'dir with space')).toBe("$'dir\\x20with space'")
  expect(spell("cat $'dir\\040w", 'dir with space/')).toBe("$'dir\\040with space/")
  expect(spell("cat $'dir\\u0020w", 'dir with space')).toBe("$'dir\\u0020with space'")
  expect(spell("cat $'caf\\U000000e9", 'café menu')).toBe("$'caf\\U000000e9 menu'")
  expect(spell("cat $'caf\\xc3\\xa9", 'café menu')).toBe("$'caf\\xc3\\xa9 menu'")
  expect(spell("cat $'caf\\303\\251'\\ m", 'café menu')).toBe("$'caf\\303\\251'\\ menu")
  // A short numeric escape would swallow a digit from the tail, so the quote is reopened.
  expect(spell("cat $'\\41", '!7')).toBe("$'\\41'$'7'")
  expect(spell("cat $'\\u3b1", 'αb')).toBe("$'\\u3b1'$'b'")
  expect(spell("cat $'\\u3b1", 'αz')).toBe("$'\\u3b1z'")
  // Escapes that are not literal text, or a split UTF-8 sequence, are respelled.
  expect(spell("cat $'a\\q", 'a\\qb')).toBe("$'a\\\\qb'")
  expect(spell("cat $'a\\x", 'a\\xb')).toBe("$'a\\\\xb'")
  expect(spell("cat $'caf\\xc3", 'café')).toBe("$'café'")
})

// bash dequotes `$"..."` like double quotes; its `$` is part of the spelling.
it('a locale-quoted word keeps its dollar', () => {
  const draft = 'cat $"dir w'
  expect(parseCompletionOutput(draft, draft.length, hexLine('dir with space'))[0]).toEqual({
    text: 'dir with space',
    insert: '$"dir with space"',
    from: 4,
    to: draft.length
  })
  expect(wordContinuesPastCursor('cat $"a b"', 7)).toBe(true)
  // A candidate that does not continue the typed word still keeps the quote form.
  expect(parseCompletionOutput('cat $"x', 7, hexLine('y z'))[0]?.insert).toBe('$"y z"')
})

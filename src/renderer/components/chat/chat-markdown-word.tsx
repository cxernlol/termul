import { type ComponentPropsWithoutRef, type CSSProperties, useState } from 'react'
import type { ExtraProps } from 'streamdown'

type WordSpanProps = ComponentPropsWithoutRef<'span'> & ExtraProps

/**
 * Longest wait before a streamed word starts to fade in. It matches
 * Streamdown's own backlog window (320 ms). Streamdown can go past it: when a
 * block mounts again, every word in the block counts as new at a 4 ms floor
 * step, so a 300-word block would hold its tail invisible for over a second.
 */
export const MAX_WORD_DELAY_MS = 320

function cappedDelay(style: CSSProperties | undefined): CSSProperties | undefined {
  const raw = (style as Record<string, unknown> | undefined)?.['--sd-delay']
  if (typeof raw !== 'string') return style
  const delay = Number.parseFloat(raw)
  if (!(delay > MAX_WORD_DELAY_MS)) return style
  return { ...style, ['--sd-delay' as string]: `${MAX_WORD_DELAY_MS}ms` }
}

/**
 * Renders Streamdown's `span` elements. While a reply streams, Streamdown wraps
 * each word in `span[data-sd-animate]` and re-renders the whole tail on every
 * commit. On that re-render it rewrites the style of every word it has already
 * seen to `--sd-duration: 0ms` with no delay, which finishes a fade that is
 * still waiting or running and pops the word in. The commits come ~10 times a
 * second, so no word ever got more than one commit window of its fade.
 *
 * An animated word keeps the style it mounted with, so its delay and duration
 * play out as scheduled, with the delay capped at {@link MAX_WORD_DELAY_MS}.
 * Other spans follow their latest style.
 */
export function ChatMarkdownSpan({
  node: _node,
  style,
  ...rest
}: WordSpanProps): React.JSX.Element {
  const [mountStyle] = useState(() => cappedDelay(style))
  const animatedWord = rest['data-sd-animate' as keyof typeof rest] !== undefined
  return <span {...rest} style={animatedWord ? mountStyle : style} />
}

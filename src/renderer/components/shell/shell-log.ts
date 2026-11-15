import { logFrontendError } from '@/lib/log-api'

type LogLevel = 'info' | 'error'

function logArea(source: 'Shell' | 'Rail', tag: string, message: string, level: LogLevel): void {
  void logFrontendError({ level, source, message: `[${tag}] ${message}` })
}

/**
 * One durable line for a shell frame flow (right panel shown or hidden, a tab
 * opened from the tool strip, a chat opened from the palette). Pass view names
 * and ids only, never a path or a title.
 */
export function logShellEvent(message: string, level: LogLevel = 'info'): void {
  logArea('Shell', 'shell', message, level)
}

/**
 * One durable line for a Rail flow (new chat, open chat, expand or collapse,
 * a chat opened from the hover peek). Pass ids only, never a chat title or
 * prompt text.
 */
export function logRailEvent(message: string, level: LogLevel = 'info'): void {
  logArea('Rail', 'rail', message, level)
}

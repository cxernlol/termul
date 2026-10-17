import { logFrontendError } from '@/lib/log-api'

/** Upper bound for one writer of the close flush; the window closes after it either way. */
export const CLOSE_WRITE_TIMEOUT_MS = 1000

type CloseWriter = () => Promise<void>

const writers = new Set<CloseWriter>()

/** Add a write the app waits for before it destroys the window. */
export function registerCloseWriter(writer: CloseWriter): () => void {
  writers.add(writer)
  return () => {
    writers.delete(writer)
  }
}

/** Run every registered writer; a failed one is logged and never stops the close. */
export async function runCloseWriters(): Promise<void> {
  const results = await Promise.allSettled([...writers].map((writer) => writer()))
  for (const result of results) {
    if (result.status === 'rejected') {
      const reason = result.reason
      void logFrontendError({
        source: 'close-flush',
        message: `A close-time write failed: ${reason instanceof Error ? reason.message : String(reason)}`
      })
    }
  }
}

/** Race `write` against {@link CLOSE_WRITE_TIMEOUT_MS}; a timeout is logged and resolves. */
export async function withinCloseTimeout(
  source: string,
  label: string,
  write: () => Promise<void>
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), CLOSE_WRITE_TIMEOUT_MS)
  })
  const outcome = await Promise.race([write().then(() => 'done' as const), timeout]).finally(() =>
    clearTimeout(timer)
  )
  if (outcome === 'timeout') {
    console.warn(`Close-time ${label} write timed out after ${CLOSE_WRITE_TIMEOUT_MS}ms`)
    void logFrontendError({
      level: 'warn',
      source,
      message: `Close-time ${label} write timed out after ${CLOSE_WRITE_TIMEOUT_MS}ms; closing anyway`
    })
  }
}

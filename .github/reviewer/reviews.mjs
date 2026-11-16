// The reviews this workflow posts come from the Actions token's bot user.
const BOT_LOGIN = 'github-actions[bot]'
export const REVIEWS_PER_PAGE = 100

// True when github-actions[bot] already posted a review whose body carries
// `marker`. Reviews from anyone else are ignored, so a user cannot paste the
// marker to suppress a review. `fetchPage(page)` returns one page (1-based) of
// the PR's reviews. Pages are read until one comes back short.
export async function hasBotReview(fetchPage, marker) {
  for (let page = 1; ; page++) {
    const reviews = await fetchPage(page)
    const found = reviews.some(
      (r) =>
        r.user?.login === BOT_LOGIN &&
        r.user?.type === 'Bot' &&
        typeof r.body === 'string' &&
        r.body.includes(marker)
    )
    if (found) return true
    if (reviews.length < REVIEWS_PER_PAGE) return false
  }
}

// SDK error classes, by `name`, that mean the provider refused the run: a bad
// or revoked key, a quota or rate limit, a model it no longer offers, or the
// service being down.
const PROVIDER_ERRORS = new Set([
  'AuthenticationError',
  'RateLimitError',
  'ConfigurationError',
  'NetworkError'
])

// The RunError shape for a provider error thrown by Agent.create or
// agent.send, or undefined for any other error.
export function providerRunError(error) {
  if (!PROVIDER_ERRORS.has(error?.name)) return undefined
  return { code: error.code ?? error.name, message: String(error.message) }
}

// How a review ends, from the last turn's status and error plus the tool calls
// and tokens of every turn. `findings` stays undefined until post_findings
// records them. This job is advisory, so a provider that failed before the
// reviewer did any work skips the review instead of failing the PR.
export function reviewOutcome({ status, error, tools, tokens, findings }) {
  if (findings !== undefined) return { kind: 'post' }
  const cause = `${error?.code ?? 'unknown'}: ${error?.message ?? 'no error details'}`
  if (status === 'error' && tools === 0 && tokens === 0) {
    return { kind: 'skip', message: `Thermo Review could not run: ${cause}` }
  }
  const detail = error === undefined ? '' : ` ${cause}`
  return { kind: 'fail', message: `Run ended (${status}) without calling post_findings.${detail}` }
}

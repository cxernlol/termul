// Run with: node --test .github/reviewer/*.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasBotReview, providerRunError, reviewOutcome } from './reviews.mjs'

const marker = '<!-- termul-reviewer:abc123 -->'
const bot = { login: 'github-actions[bot]', type: 'Bot' }
const human = { login: 'someone', type: 'User' }
const review = (user, body) => ({ user, body })
const filler = (n) => Array.from({ length: n }, () => review(human, 'looks good'))

// Serves `reviews` in pages of `perPage`, like the GitHub list endpoint.
const pager = (reviews, perPage = 100) => {
  const requested = []
  const fetchPage = async (page) => {
    requested.push(page)
    return reviews.slice((page - 1) * perPage, page * perPage)
  }
  return { fetchPage, requested }
}

test('ignores the marker in a review from a non-bot user', async () => {
  const { fetchPage } = pager([review(human, `spoof ${marker}`)])
  assert.equal(await hasBotReview(fetchPage, marker), false)
})

test('ignores the marker from a user whose login only looks like the bot', async () => {
  const { fetchPage } = pager([review({ login: 'github-actions[bot]', type: 'User' }, marker)])
  assert.equal(await hasBotReview(fetchPage, marker), false)
})

test('counts the marker in a review from github-actions[bot]', async () => {
  const { fetchPage } = pager([review(bot, `## Thermo review\n\n${marker}`)])
  assert.equal(await hasBotReview(fetchPage, marker), true)
})

test('ignores a bot review for another commit', async () => {
  const { fetchPage } = pager([review(bot, '<!-- termul-reviewer:other -->')])
  assert.equal(await hasBotReview(fetchPage, marker), false)
})

test('finds the marker on page 2', async () => {
  const { fetchPage, requested } = pager([...filler(100), review(bot, marker)])
  assert.equal(await hasBotReview(fetchPage, marker), true)
  assert.deepEqual(requested, [1, 2])
})

test('stops after a short page', async () => {
  const { fetchPage, requested } = pager(filler(100))
  assert.equal(await hasBotReview(fetchPage, marker), false)
  assert.deepEqual(requested, [1, 2])
})

const sdkError = (name, message, code) => Object.assign(new Error(message), { name, code })

test('maps a thrown SDK rate limit error to its code and message', () => {
  const error = sdkError('RateLimitError', 'Usage limit reached', 'usage_limit_exceeded')
  assert.deepEqual(providerRunError(error), {
    code: 'usage_limit_exceeded',
    message: 'Usage limit reached'
  })
})

test('uses the error class name when a thrown SDK error has no code', () => {
  const error = sdkError('AuthenticationError', 'Invalid API key')
  assert.deepEqual(providerRunError(error), {
    code: 'AuthenticationError',
    message: 'Invalid API key'
  })
})

test('does not treat a plain error or an agent busy error as a provider failure', () => {
  assert.equal(providerRunError(new TypeError('x is undefined')), undefined)
  assert.equal(providerRunError(sdkError('AgentBusyError', 'busy')), undefined)
})

test('skips with the cause when the run errored before any tool call or token', () => {
  const outcome = reviewOutcome({
    status: 'error',
    error: { code: 'resource_exhausted', message: 'Out of usage credits' },
    tools: 0,
    tokens: 0,
    findings: undefined
  })
  assert.deepEqual(outcome, {
    kind: 'skip',
    message: 'Thermo Review could not run: resource_exhausted: Out of usage credits'
  })
})

test('skips with placeholders when the provider gave no error details', () => {
  const outcome = reviewOutcome({ status: 'error', tools: 0, tokens: 0, findings: undefined })
  assert.deepEqual(outcome, {
    kind: 'skip',
    message: 'Thermo Review could not run: unknown: no error details'
  })
})

test('fails when the run errored after the reviewer called tools', () => {
  const outcome = reviewOutcome({
    status: 'error',
    error: { code: 'internal', message: 'stream reset' },
    tools: 4,
    tokens: 0,
    findings: undefined
  })
  assert.deepEqual(outcome, {
    kind: 'fail',
    message: 'Run ended (error) without calling post_findings. internal: stream reset'
  })
})

test('fails when the run errored after the model produced tokens', () => {
  const outcome = reviewOutcome({ status: 'error', tools: 0, tokens: 1200, findings: undefined })
  assert.deepEqual(outcome, {
    kind: 'fail',
    message: 'Run ended (error) without calling post_findings.'
  })
})

test('fails when the run finished without posting findings', () => {
  const outcome = reviewOutcome({
    status: 'finished',
    tools: 7,
    tokens: 50000,
    findings: undefined
  })
  assert.deepEqual(outcome, {
    kind: 'fail',
    message: 'Run ended (finished) without calling post_findings.'
  })
})

test('posts when findings were recorded, even an empty list', () => {
  const outcome = reviewOutcome({ status: 'finished', tools: 3, tokens: 9000, findings: [] })
  assert.deepEqual(outcome, { kind: 'post' })
})

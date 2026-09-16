import test from 'node:test'
import assert from 'node:assert/strict'
import { createJwtClockSkewRetryFetch } from './jwtClockSkewRetry.js'

const jwtFutureResponse = () =>
  Response.json(
    { code: 'PGRST303', message: 'JWT issued at future' },
    { status: 401 },
  )

test('retries a Data API request rejected because of JWT clock skew', async () => {
  const responses = [jwtFutureResponse(), jwtFutureResponse(), Response.json([])]
  const calls = []
  const waits = []
  const retryingFetch = createJwtClockSkewRetryFetch(
    async (...args) => {
      calls.push(args)
      return responses.shift()
    },
    {
      retryDelaysMs: [1000, 2000, 4000],
      waitImplementation: async (milliseconds) => waits.push(milliseconds),
    },
  )

  const response = await retryingFetch(
    'https://example.supabase.co/rest/v1/suppliers',
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 3)
  assert.deepEqual(waits, [1000, 2000])
})

test('does not retry unrelated authentication failures', async () => {
  let calls = 0
  const retryingFetch = createJwtClockSkewRetryFetch(async () => {
    calls += 1
    return Response.json({ message: 'Invalid login credentials' }, { status: 401 })
  })

  const response = await retryingFetch(
    'https://example.supabase.co/auth/v1/token',
  )

  assert.equal(response.status, 401)
  assert.equal(calls, 1)
})

test('returns the last response when the retry budget is exhausted', async () => {
  let calls = 0
  const retryingFetch = createJwtClockSkewRetryFetch(
    async () => {
      calls += 1
      return jwtFutureResponse()
    },
    {
      retryDelaysMs: [0, 0],
      waitImplementation: async () => {},
    },
  )

  const response = await retryingFetch(
    'https://example.supabase.co/rest/v1/suppliers',
  )

  assert.equal(response.status, 401)
  assert.equal(calls, 3)
})

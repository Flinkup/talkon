const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000]

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

function isDataApiRequest(input) {
  try {
    const url = typeof input === 'string' ? input : input.url
    return new URL(url).pathname.startsWith('/rest/v1/')
  } catch {
    return false
  }
}

async function isJwtIssuedAtFuture(response) {
  if (response.status !== 401) return false

  try {
    const payload = await response.clone().json()
    return (
      payload?.code === 'PGRST303' &&
      payload?.message?.toLowerCase().includes('jwt issued at future')
    )
  } catch {
    return false
  }
}

function cloneRequest(input) {
  return typeof Request !== 'undefined' && input instanceof Request
    ? input.clone()
    : input
}

export function createJwtClockSkewRetryFetch(
  fetchImplementation,
  {
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    waitImplementation = wait,
  } = {},
) {
  return async function fetchWithJwtClockSkewRetry(input, init) {
    const shouldRetry = isDataApiRequest(input)

    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImplementation(cloneRequest(input), init)

      if (
        !shouldRetry ||
        attempt >= retryDelaysMs.length ||
        !(await isJwtIssuedAtFuture(response))
      ) {
        return response
      }

      await waitImplementation(retryDelaysMs[attempt])
    }
  }
}

export const fetchWithJwtClockSkewRetry = createJwtClockSkewRetryFetch(
  globalThis.fetch.bind(globalThis),
)

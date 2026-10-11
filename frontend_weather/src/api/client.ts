import type { z } from 'zod'
import { apiErrorSchema } from './schemas'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api'
// One plan waits on HERE routing and several Open-Meteo requests.
const TIMEOUT_MS = 60_000

export class ApiError extends Error {
  status: number | null
  fieldErrors: Record<string, string>
  // Whether trying the same request again could succeed.
  retryable: boolean

  constructor(
    message: string,
    status: number | null,
    fieldErrors: Record<string, string> = {},
    retryable = true,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.retryable = retryable
  }
}

export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('The server took too long to answer. Please try again.', null)
    }
    // Cancelled by the caller (TanStack Query): let it through untouched.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('Could not reach the server. Check your connection and try again.', null)
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Non-JSON body; handled below.
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body)
    throw new ApiError(
      parsed.success ? parsed.data.detail : `The server returned an error (${response.status}).`,
      response.status,
      parsed.success ? parsed.data.field_errors : undefined,
      parsed.success ? parsed.data.retryable : undefined,
    )
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    console.error('Unexpected response shape from', path, parsed.error)
    throw new ApiError('The server sent a response this app does not understand.', response.status)
  }
  return parsed.data
}

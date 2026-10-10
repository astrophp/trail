import { boot } from '@/lib/boot'

type Param = string | number | boolean | null | undefined

export type RequestOptions = {
    method?: 'GET' | 'PUT' | 'POST' | 'DELETE'
    /** Null, undefined, empty strings and false are left out; true is sent as 1. */
    params?: Record<string, Param>
    body?: unknown
    signal?: AbortSignal
}

/**
 * Every way a request can fail. `status` is null when no response came back
 * (the network failed); `errors` is set on a 422 only.
 */
export class ApiError extends Error {
    readonly status: number | null
    readonly errors: Record<string, string[]> | null

    constructor(
        message: string,
        status: number | null = null,
        errors: Record<string, string[]> | null = null,
    ) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.errors = errors
    }
}

function queryString(params: RequestOptions['params']): string {
    const query = new URLSearchParams()

    for (const [key, value] of Object.entries(params ?? {})) {
        if (value === null || value === undefined || value === '') {
            continue
        }

        if (typeof value === 'boolean') {
            if (value) {
                query.set(key, '1')
            }
        } else {
            query.set(key, String(value))
        }
    }

    const text = query.toString()

    return text === '' ? '' : `?${text}`
}

/** A failure in a sentence: whether the server answered, and with what. */
export function failureMessage(error: unknown): string {
    if (error instanceof ApiError) {
        return error.status === null
            ? 'The server could not be reached. Check the connection and try again.'
            : `The server answered with an error (${error.status}).`
    }

    return 'Something unexpected happened.'
}

/** Whether an error says the thing asked for does not exist: a 404. */
export function isNotFound(error: unknown): boolean {
    return error instanceof ApiError && error.status === 404
}

/** The URL of an API path with its query: for a request, and for a link the browser follows itself. */
export function apiUrl(
    path: string,
    params?: RequestOptions['params'],
): string {
    return `${boot().apiPath}${path}${queryString(params)}`
}

/** The body of a response: whether there was none, and what it parses to (`undefined` when it is not JSON). */
async function readBody(
    response: Response,
): Promise<{ empty: boolean; json: unknown }> {
    const text = await response.text().catch(() => '')

    try {
        return { empty: text.trim() === '', json: JSON.parse(text) as unknown }
    } catch {
        return { empty: text.trim() === '', json: undefined }
    }
}

function failure(status: number, body: unknown): ApiError {
    const fields =
        typeof body === 'object' && body !== null
            ? (body as { message?: unknown; errors?: unknown })
            : {}
    const message =
        typeof fields.message === 'string' && fields.message !== ''
            ? fields.message
            : `The request failed (${status}).`
    const errors =
        status === 422 && typeof fields.errors === 'object'
            ? (fields.errors as Record<string, string[]> | null)
            : null

    return new ApiError(message, status, errors)
}

/**
 * Calls the dashboard API. `path` is relative to the API root, for example `/meta`.
 * A success without a body (204, 205, or an empty 2xx) resolves to `undefined`;
 * callers of such an endpoint type `T` as `void`.
 */
export async function apiRequest<T>(
    path: string,
    { method = 'GET', params, body, signal }: RequestOptions = {},
): Promise<T> {
    const { csrfToken } = boot()
    const headers: Record<string, string> = { Accept: 'application/json' }

    if (method !== 'GET') {
        if (csrfToken !== null) {
            headers['X-CSRF-TOKEN'] = csrfToken
        }

        if (body !== undefined) {
            headers['Content-Type'] = 'application/json'
        }
    }

    let response: Response

    try {
        response = await fetch(apiUrl(path, params), {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin',
            signal,
        })
    } catch (error) {
        if (signal?.aborted) {
            throw error
        }

        throw new ApiError('The server could not be reached.')
    }

    const { empty, json } = await readBody(response)

    if (signal?.aborted) {
        throw signal.reason
    }

    if (!response.ok) {
        throw failure(response.status, json)
    }

    if (response.status === 204 || response.status === 205 || empty) {
        return undefined as T
    }

    if (json === undefined) {
        throw new ApiError(
            'The server sent a response that is not valid JSON.',
            response.status,
        )
    }

    return json as T
}

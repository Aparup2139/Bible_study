/**
 * Typed HTTP client for the BibleWay backend API.
 *
 * Zero extra dependencies — uses the built-in fetch. Reads the base URL from
 * `EXPO_PUBLIC_API_URL` (set in `.env` / app config); falls back to localhost
 * for local development.
 *
 * Phase 0: the client exists but the app still uses mock data. As each backend
 * phase lands, swap the `queryFn` bodies in `src/hooks/` to call `api.get(...)`.
 * Auth wiring (Phase 1) will call `setAuthTokenProvider` so every request carries
 * the Supabase access token.
 */

const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';

const BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? DEFAULT_BASE_URL;

type AuthTokenProvider = () => string | null | Promise<string | null>;

let authTokenProvider: AuthTokenProvider | null = null;

/** Register a function that returns the current access token (set up in Phase 1). */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  authTokenProvider = provider;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  /** Query-string params; undefined/null values are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(
    path.startsWith('/') ? path.slice(1) : path,
    BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = authTokenProvider ? await authTokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, options?.query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const message =
      (payload as { message?: string } | undefined)?.message ??
      `Request failed: ${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

export const api = {
  baseUrl: BASE_URL,
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};
